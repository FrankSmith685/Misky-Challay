import { CustomerWorkspace, CustomerMedia } from '@database/models/customerJourney.model';
import {
  Address,
  Branch,
  District,
  MobileDevice,
  NewsletterSubscription,
  Notification,
  Order,
  Product,
  ProductAvailabilitySubscription,
  ProductFavorite,
  ProductVariant,
  SavedBowl,
  Subscription,
  SubscriptionCycle,
  User,
  UserPreference,
  UserPurchaseContext,
  Wallet,
  sequelize,
} from '@database/models';
import { Op } from 'sequelize';
import { DELIVERY_TYPE, ORDER_STATUS, USER_STATUS, type OrderStatus } from '@config/constants';
import { ApiError } from '@shared/errors/ApiError';
import { revokeSessionCache } from '@middlewares/auth.middleware';
import { comparePassword, hashPassword } from '@shared/utils/password';
import { round2 } from '@shared/utils/money';
import { normalizePhone } from '@shared/utils/phone';
import type {
  ChangePasswordInput,
  CreateAddressInput,
  UpdateAddressInput,
  UpdateProfileInput,
  CreateSavedBowlInput,
  UpdateSavedBowlInput,
  UpdateFoodPreferencesInput,
  UpdatePurchaseContextInput,
} from './account.validation';
import { customizationService } from '@modules/customization/customization.service';
import { mediaService } from '@modules/media/media.service';

/**
 * Direcciones del cliente (M02).
 * Los clientes solo acceden a sus propios datos: cada consulta filtra por userId.
 */
/** Forma publica del perfil (nunca incluye el hash de la contrasena). */
const toProfile = (user: User) => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  avatarUrl: user.avatarUrl,
  phone: user.phone,
  emailVerifiedAt: user.emailVerifiedAt,
  createdAt: user.createdAt,
});

/** El distrito operativo viaja con la direccion: el frontend valida cobertura con el. */
const DISTRICT_INCLUDE = {
  model: District,
  as: 'district',
  attributes: ['id', 'name', 'ubigeoCode'],
};

/** De la sede solo se publica lo que el cliente ve en la tarjeta de recojo. */
const toBranchSummary = (branch: Branch) => ({
  id: branch.id,
  name: branch.name,
  addressLine: branch.addressLine,
});

/**
 * Pedidos que siguen vivos. Con uno de estos abierto la cuenta no se cierra:
 * quedaria un plato en cocina, o un reparto en la calle, sin nadie a quien
 * llamar. Los de pago pendiente tambien cuentan, pero el job de caducidad los
 * cancela a los 15 minutos, asi que nunca bloquean para siempre.
 */
const OPEN_ORDER_STATUSES: OrderStatus[] = [
  ORDER_STATUS.PENDING_PAYMENT,
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.READY,
  ORDER_STATUS.OUT_FOR_DELIVERY,
];

/**
 * Correo con el que se sustituye al real.
 *
 * `.invalid` es un dominio reservado (RFC 2606): nunca existira ni sera
 * enrutable. Lleva el id dentro porque `users.email` es unico incluso contando
 * las filas dadas de baja, y sin esa parte la segunda cuenta eliminada chocaria
 * con la primera.
 */
const anonymizedEmail = (userId: number): string => `eliminado+${userId}@cuenta-eliminada.invalid`;

export interface DeleteAccountInput {
  /** Reautenticacion: eliminar la cuenta exige volver a probar quien eres. */
  password: string;
  /** Motivo opcional; se guarda solo en la bitacora, nunca en el perfil. */
  reason?: string;
}

/** Lo que se llevo la baja y lo que se queda, para poder decirselo al titular. */
export interface DeleteAccountResult {
  deletedAt: Date;
  /** Pedidos y comprobantes que se conservan por obligacion tributaria (SUNAT). */
  keptOrders: number;
  /** Saldo que se pierde al cerrar la cuenta. Informativo: la web avisa antes. */
  forfeitedWalletBalance: number;
  removed: {
    addresses: number;
    savedBowls: number;
    favorites: number;
    availabilityAlerts: number;
    devices: number;
  };
}

export const accountService = {
  async getFoodPreferences(userId: number) {
    const row = await UserPreference.findOne({ where: { userId } });
    return {
      allergens: row?.allergens ?? [],
      dietaryTags: row?.dietaryTags ?? [],
      dislikedOptionIds: row?.dislikedOptionIds ?? [],
    };
  },

  async updateFoodPreferences(userId: number, input: UpdateFoodPreferencesInput) {
    const [row] = await UserPreference.findOrCreate({
      where: { userId },
      defaults: { userId, allergens: [], dietaryTags: [], dislikedOptionIds: [] },
    });
    return row.update({
      allergens: [...new Set(input.allergens)],
      dietaryTags: [...new Set(input.dietaryTags)],
      dislikedOptionIds: [...new Set(input.dislikedOptionIds)],
    }).then((updated) => ({
      allergens: updated.allergens,
      dietaryTags: updated.dietaryTags,
      dislikedOptionIds: updated.dislikedOptionIds,
    }));
  },

  async getProfile(userId: number) {
    const user = await User.findByPk(userId);
    if (!user) throw ApiError.notFound('Usuario no encontrado');
    return toProfile(user);
  },

  async updateProfile(userId: number, input: UpdateProfileInput) {
    const user = await User.findByPk(userId);
    if (!user) throw ApiError.notFound('Usuario no encontrado');

    if (input.firstName !== undefined) user.firstName = input.firstName;
    if (input.lastName !== undefined) user.lastName = input.lastName;

    // "" borra el telefono; un valor lo normaliza y lo actualiza.
    if (input.phone !== undefined) {
      const phone = normalizePhone(input.phone);
      // Mismo motivo que en el registro: `users.phone` es unico, y sin este
      // control el choque salia como un 409 sin campo desde el driver.
      if (phone && phone !== user.phone) {
        const taken = await User.findOne({
          where: { phone, id: { [Op.ne]: userId } },
          paranoid: false,
        });
        if (taken) throw ApiError.conflict('Ese telefono ya esta registrado en otra cuenta');
      }
      user.phone = phone;
    }

    await user.save();
    return toProfile(user);
  },

  /** Guarda la imagen en disco y deja en `users` solo su URL estable. */
  async updateAvatar(
    userId: number,
    input: { fileName: string; mimeType: string; dataUrl: string },
  ) {
    const user = await User.findByPk(userId);
    if (!user) throw ApiError.notFound('Usuario no encontrado');

    const previousUrl = user.avatarUrl;
    const asset = await mediaService.upload({
      ...input,
      altText: `Foto de perfil de ${user.fullName || 'cliente'}`,
      category: 'profile',
      createdBy: user.id,
    });

    user.avatarUrl = asset.url;
    try {
      await user.save();
    } catch (error) {
      await mediaService.purgeOwnedProfile(asset.url, user.id);
      throw error;
    }

    // La foto anterior sale de uso, pero se conserva recuperable igual que el
    // resto de la biblioteca. Nunca se elimina una ruta que pertenezca a otro usuario.
    if (previousUrl && previousUrl !== asset.url) {
      await mediaService.purgeOwnedProfile(previousUrl, user.id);
    }

    return toProfile(user);
  },

  async removeAvatar(userId: number) {
    const user = await User.findByPk(userId);
    if (!user) throw ApiError.notFound('Usuario no encontrado');
    const previousUrl = user.avatarUrl;
    user.avatarUrl = null;
    await user.save();

    if (previousUrl) await mediaService.purgeOwnedProfile(previousUrl, user.id);
    return toProfile(user);
  },

  async changePassword(userId: number, input: ChangePasswordInput) {
    const user = await User.scope('withPassword').findByPk(userId);
    if (!user?.passwordHash) throw ApiError.notFound('Usuario no encontrado');

    const valid = await comparePassword(input.currentPassword, user.passwordHash);
    if (!valid) throw ApiError.unauthorized('La contrasena actual no es correcta');

    user.passwordHash = await hashPassword(input.newPassword);
    // Cambiar la clave cierra las demas sesiones: es lo que promete jwt.ts y lo que
    // hace el reset. Sin esto, una sesion robada sobrevivia al cambio de contrasena.
    user.tokenVersion += 1;
    await user.save();
  },

  /**
   * BAJA DE LA CUENTA A PETICION DEL TITULAR
   * -------------------------------------------------------------------------
   * Se ANONIMIZA, no se borra. Los pedidos y sus comprobantes son documentos
   * tributarios: la Ley 29733 permite cancelar los datos personales, pero el
   * Codigo Tributario obliga a conservar el comprobante y su emisor. Borrar la
   * fila `users` arrastraria el historial de ventas (y dejaria pedidos sin
   * cliente), asi que el rastro de venta se queda y lo que identifica a la
   * persona desaparece: correo, telefono, nombres y libreta de direcciones.
   *
   * Al liberar el correo y el telefono reales, quien se arrepiente puede volver
   * a registrarse con ellos: el control de unicidad del registro mira tambien
   * las cuentas dadas de baja (`paranoid: false` en auth.service), y sin este
   * relevo su propio email le quedaria vetado para siempre.
   */
  async deleteAccount(userId: number, input: DeleteAccountInput): Promise<DeleteAccountResult> {
    const user = await User.scope('withPassword').findByPk(userId);
    if (!user) throw ApiError.notFound('Usuario no encontrado');
    if (user.status === USER_STATUS.DELETED) {
      throw ApiError.conflict('Esta cuenta ya fue eliminada');
    }

    // Reautenticacion. Una sesion abierta en un movil prestado no basta para
    // cerrar la cuenta de otro: hay que saber la contrasena.
    if (!user.passwordHash) {
      throw ApiError.unprocessable(
        'Esta cuenta no tiene contrasena propia. Escribenos para darla de baja.',
      );
    }
    const valid = await comparePassword(input.password, user.passwordHash);
    if (!valid) throw ApiError.unauthorized('La contrasena no es correcta');

    // Misma regla que en el panel: el sistema no puede quedarse sin dueno.
    if (user.isSuperAdmin) {
      throw ApiError.unprocessable(
        'Una cuenta de superadministrador no se elimina desde aqui: traspasa primero la marca a otra persona',
      );
    }

    const openOrders = await Order.count({
      where: { userId, status: { [Op.in]: OPEN_ORDER_STATUSES } },
    });
    if (openOrders > 0) {
      throw ApiError.conflict(
        openOrders === 1
          ? 'Tienes un pedido en curso. Espera a recibirlo o cancelalo antes de eliminar tu cuenta.'
          : `Tienes ${openOrders} pedidos en curso. Espera a recibirlos o cancelalos antes de eliminar tu cuenta.`,
      );
    }

    const recurring = await Subscription.count({ where: { userId, status: { [Op.in]: ['PENDING', 'ACTIVE', 'PAST_DUE'] } } });
    if (recurring > 0) throw ApiError.conflict('Cancela tus suscripciones mensuales antes de eliminar la cuenta para detener los próximos cobros.');
    const unusedBoxes = await SubscriptionCycle.count({
      where: { orderId: null, expiresAt: { [Op.gt]: new Date() } },
      include: [{ model: Subscription, as: 'subscription', where: { userId } }],
    });
    if (unusedBoxes > 0) throw ApiError.conflict('Tienes cajas mensuales pagadas sin programar. Úsalas o contacta a soporte antes de eliminar la cuenta.');

    const previousEmail = user.email;
    const previousAvatarUrl = user.avatarUrl;
    const wallet = await Wallet.findOne({ where: { userId } });
    const forfeitedWalletBalance = round2(Number(wallet?.balance ?? 0));

    const result = await sequelize.transaction(async (transaction) => {
      const keptOrders = await Order.count({ where: { userId }, transaction });

      // Preferencias y contexto de compra: se van enteros, no hay nada que conservar.
      await UserPreference.destroy({ where: { userId }, transaction });
      await UserPurchaseContext.destroy({ where: { userId }, transaction });
      await CustomerWorkspace.destroy({where:{userId},transaction});
      await CustomerMedia.destroy({where:{userId},transaction});

      const savedBowls = await SavedBowl.destroy({ where: { userId }, force: true, transaction });
      const favorites = await ProductFavorite.destroy({ where: { userId }, transaction });
      const availabilityAlerts = await ProductAvailabilitySubscription.destroy({
        where: { userId },
        transaction,
      });

      /* Las direcciones se borran de verdad (`force`), no en blando: son el dato
       * mas sensible de todos y el pedido ya guarda su propia copia congelada en
       * `addressSnapshotJson`, asi que el historial no pierde nada. */
      const addresses = await Address.destroy({ where: { userId }, force: true, transaction });

      // El boletin es puro dato de contacto: sin cuenta no hay a quien escribir.
      await NewsletterSubscription.destroy({
        where: previousEmail ? { [Op.or]: [{ userId }, { email: previousEmail }] } : { userId },
        transaction,
      });

      // Los envios se conservan como bitacora, pero sin la direccion de destino.
      await Notification.update(
        { recipient: anonymizedEmail(user.id) },
        { where: { userId }, transaction },
      );

      // Ningun movil vuelve a recibir un aviso de esta cuenta.
      const [devices] = await MobileDevice.update(
        { isActive: false, lastSeenAt: new Date() },
        { where: { userId }, transaction },
      );

      user.email = anonymizedEmail(user.id);
      user.phone = null;
      user.firstName = null;
      user.lastName = null;
      user.avatarUrl = null;
      // Sin hash no hay inicio de sesion posible, ni siquiera con la clave correcta.
      user.passwordHash = null;
      user.status = USER_STATUS.DELETED;
      user.emailVerifiedAt = null;
      // Un enlace de recuperacion pendiente no puede resucitar la cuenta.
      user.passwordResetTokenHash = null;
      user.passwordResetExpiresAt = null;
      // Revoca de golpe todos los refresh tokens ya emitidos (ver jwt.ts).
      user.tokenVersion += 1;
      await user.save({ transaction });
      await user.destroy({ transaction }); // borrado logico: queda `deletedAt`

      return {
        deletedAt: user.deletedAt ?? new Date(),
        keptOrders,
        forfeitedWalletBalance,
        removed: { addresses, savedBowls, favorites, availabilityAlerts, devices },
      };
    });

    /* El middleware cachea el estado de la sesion unos segundos: sin descartarlo,
     * el token en curso seguiria entrando a una cuenta que ya no existe. */
    revokeSessionCache(userId);
    if (previousAvatarUrl) await mediaService.purgeOwnedProfile(previousAvatarUrl, userId);
    return result;
  },

  async listAddresses(userId: number) {
    return Address.findAll({
      where: { userId },
      include: [DISTRICT_INCLUDE],
      order: [
        ['isDefault', 'DESC'],
        ['createdAt', 'DESC'],
      ],
    });
  },

  /**
   * Donde entregamos, para rehidratar la tienda en un navegador nuevo.
   *
   * Devuelve referencias resueltas, nunca cobertura: quien lo consume vuelve a
   * preguntar por las zonas vigentes antes de dar la direccion por buena.
   * `source` distingue lo que el cliente eligio de lo que estamos suponiendo:
   *   SAVED           - su ultima seleccion real
   *   DEFAULT_ADDRESS - no hay seleccion (o murio); proponemos su direccion principal
   *   EMPTY           - no hay nada que proponer, habra que preguntarle
   */
  async getPurchaseContext(userId: number) {
    const row = await UserPurchaseContext.findOne({
      where: { userId },
      include: [
        { model: Address, as: 'address', include: [DISTRICT_INCLUDE] },
        { model: Branch, as: 'branch' },
      ],
    });

    const savedAddress = (row?.get('address') ?? null) as Address | null;
    const savedBranch = (row?.get('branch') ?? null) as Branch | null;
    // Una sede desactivada ya no atiende: equivale a no tener sede guardada.
    const branch = savedBranch?.isActive ? savedBranch : null;

    if (row?.deliveryType === DELIVERY_TYPE.PICKUP && branch) {
      return {
        source: 'SAVED' as const,
        deliveryType: DELIVERY_TYPE.PICKUP,
        cityId: row.cityId,
        branch: toBranchSummary(branch),
        address: null,
      };
    }

    // Delivery (o un recojo cuya sede ya no existe): manda la direccion. Si la
    // guardada se borro, o si nunca hubo contexto, la principal de la libreta es
    // la mejor suposicion; es lo que evita preguntar de nuevo a quien ya la tenia.
    const address =
      savedAddress ??
      (await Address.findOne({ where: { userId, isDefault: true }, include: [DISTRICT_INCLUDE] }));

    return {
      source: (!address ? 'EMPTY' : savedAddress ? 'SAVED' : 'DEFAULT_ADDRESS') as
        | 'SAVED'
        | 'DEFAULT_ADDRESS'
        | 'EMPTY',
      deliveryType: DELIVERY_TYPE.DELIVERY,
      cityId: row?.cityId ?? null,
      branch: branch ? toBranchSummary(branch) : null,
      address,
    };
  },

  async savePurchaseContext(userId: number, input: UpdatePurchaseContextInput) {
    // Nadie apunta su contexto a la direccion de otro cliente.
    if (input.addressId != null) {
      const owned = await Address.count({ where: { id: input.addressId, userId } });
      if (!owned) throw ApiError.notFound('Direccion no encontrada');
    }
    if (input.branchId != null) {
      const branch = await Branch.findOne({ where: { id: input.branchId, isActive: true } });
      if (!branch) throw ApiError.notFound('Sede no encontrada');
    }

    const values = {
      deliveryType: input.deliveryType,
      cityId: input.cityId ?? null,
      branchId: input.branchId ?? null,
      // En recojo no hay direccion de entrega; guardarla solo crearia estados imposibles.
      addressId: input.deliveryType === DELIVERY_TYPE.PICKUP ? null : (input.addressId ?? null),
    };

    const [row, created] = await UserPurchaseContext.findOrCreate({
      where: { userId },
      defaults: { userId, ...values },
    });
    if (!created) await row.update(values);

    return accountService.getPurchaseContext(userId);
  },

  async createAddress(userId: number, input: CreateAddressInput) {
    return sequelize.transaction(async (transaction) => {
      const count = await Address.count({ where: { userId }, transaction });
      const isDefault = input.isDefault ?? count === 0;

      if (isDefault) {
        await Address.update({ isDefault: false }, { where: { userId }, transaction });
      }

      return Address.create(
        {
          userId,
          label: input.label,
          line1: input.line1,
          reference: input.reference ?? null,
          districtId: input.districtId ?? null,
          ubigeoCode: input.ubigeoCode ?? null,
          departmentName: input.departmentName ?? null,
          provinceName: input.provinceName ?? null,
          districtName: input.districtName ?? null,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          isDefault,
        },
        { transaction },
      );
    });
  },

  async updateAddress(userId: number, addressId: number, input: UpdateAddressInput) {
    const address = await Address.findOne({ where: { id: addressId, userId } });
    if (!address) throw ApiError.notFound('Direccion no encontrada');

    return sequelize.transaction(async (transaction) => {
      if (input.isDefault) {
        await Address.update({ isDefault: false }, { where: { userId }, transaction });
      }

      address.set({
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.line1 !== undefined ? { line1: input.line1 } : {}),
        ...(input.reference !== undefined ? { reference: input.reference } : {}),
        ...(input.districtId !== undefined ? { districtId: input.districtId } : {}),
        ...(input.ubigeoCode !== undefined ? { ubigeoCode: input.ubigeoCode } : {}),
        ...(input.departmentName !== undefined ? { departmentName: input.departmentName } : {}),
        ...(input.provinceName !== undefined ? { provinceName: input.provinceName } : {}),
        ...(input.districtName !== undefined ? { districtName: input.districtName } : {}),
        ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
        ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
      });

      return address.save({ transaction });
    });
  },

  async deleteAddress(userId: number, addressId: number) {
    const address = await Address.findOne({ where: { id: addressId, userId } });
    if (!address) throw ApiError.notFound('Direccion no encontrada');
    await address.destroy(); // borrado logico (paranoid)
  },

  async listSavedBowls(userId: number) {
    const rows = await SavedBowl.findAll({
      where: { userId },
      include: [
        { model: Product, as: 'product', attributes: ['id', 'name', 'slug', 'imageUrl'] },
        { model: ProductVariant, as: 'variant', attributes: ['id', 'name', 'basePrice'] },
      ],
      order: [['updatedAt', 'DESC']],
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      productId: row.productId,
      variantId: row.variantId,
      selections: row.selections,
      product: row.get('product'),
      variant: row.get('variant'),
      updatedAt: row.updatedAt,
    }));
  },

  async createSavedBowl(userId: number, input: CreateSavedBowlInput) {
    // Reutiliza el mismo motor del carrito: no se puede guardar una receta invalida.
    await customizationService.quote({ ...input, quantity: 1 });
    const count = await SavedBowl.count({ where: { userId } });
    if (count >= 20) throw ApiError.unprocessable('Puedes guardar hasta 20 bowls favoritos');
    return SavedBowl.create({ userId, ...input, lastOrderedAt: null });
  },

  async updateSavedBowl(userId: number, id: number, input: UpdateSavedBowlInput) {
    const bowl = await SavedBowl.findOne({ where: { id, userId } });
    if (!bowl) throw ApiError.notFound('Bowl guardado no encontrado');
    const next = {
      name: input.name ?? bowl.name,
      productId: input.productId ?? bowl.productId,
      variantId: input.variantId ?? bowl.variantId,
      selections: input.selections ?? bowl.selections,
    };
    await customizationService.quote({ ...next, quantity: 1 });
    await bowl.update(next);
    return bowl;
  },

  async deleteSavedBowl(userId: number, id: number) {
    const bowl = await SavedBowl.findOne({ where: { id, userId } });
    if (!bowl) throw ApiError.notFound('Bowl guardado no encontrado');
    await bowl.destroy();
  },
};

export type AccountService = typeof accountService;
