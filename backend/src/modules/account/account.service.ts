import { Address, District, Product, ProductVariant, SavedBowl, User, UserPreference, sequelize } from '@database/models';
import { ApiError } from '@shared/errors/ApiError';
import { comparePassword, hashPassword } from '@shared/utils/password';
import type {
  ChangePasswordInput,
  CreateAddressInput,
  UpdateAddressInput,
  UpdateProfileInput,
  CreateSavedBowlInput,
  UpdateSavedBowlInput,
  UpdateFoodPreferencesInput,
} from './account.validation';
import { customizationService } from '@modules/customization/customization.service';

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
  phone: user.phone,
  emailVerifiedAt: user.emailVerifiedAt,
  createdAt: user.createdAt,
});

export const accountService = {
  async getFoodPreferences(userId: number) {
    const row = await UserPreference.findOne({ where: { userId } });
    return row ?? {
      userId,
      allergens: [],
      dietaryTags: [],
      dislikedOptionIds: [],
      calorieTarget: null,
      proteinTarget: null,
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
      calorieTarget: input.calorieTarget ?? null,
      proteinTarget: input.proteinTarget ?? null,
    });
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
    // "" borra el telefono; un valor lo actualiza.
    if (input.phone !== undefined) user.phone = input.phone === '' ? null : input.phone;

    await user.save();
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

  async listAddresses(userId: number) {
    return Address.findAll({
      where: { userId },
      include: [{ model: District, as: 'district', attributes: ['id', 'name', 'ubigeoCode'] }],
      order: [
        ['isDefault', 'DESC'],
        ['createdAt', 'DESC'],
      ],
    });
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
