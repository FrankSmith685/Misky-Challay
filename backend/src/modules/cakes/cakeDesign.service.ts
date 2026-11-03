import { type Transaction } from 'sequelize';
import {
  Branch, CakeDesignQuote, CakeDesignRequest, CakeDesignReference, CakeProductProfile, DeliverySlot, InventoryItem, Product, ProductVariant, User, sequelize,
} from '@database/models';
import type { CakeDesignBrief, CakeEffort } from '@database/models/cakeProduction.model';
import { PRODUCT_STATUS } from '@database/models/product.model';
import { ApiError } from '@shared/errors/ApiError';
import { customizationService } from '@modules/customization/customization.service';
import { cakeProductionService, type CakeSelection } from './cakeProduction.service';
import { loadThemeForProduct, snapshotTheme } from './cakeThemeRules';
import { buildDesignQuoteScope, type DesignSpecification } from './designQuoteScope';
import { whatsappService } from '@integrations/whatsapp/whatsapp.service';
import { whatsappRecipient } from '@shared/utils/whatsappPhone';
import { logger } from '@config/logger';
import { cakeVisualDesignSchema } from './cakeVisualDesign';

const publicRequest = (row: CakeDesignRequest) => {
  const value = { ...row.get({ plain: true }) } as Omit<CakeDesignRequest, 'referenceBytes' | 'briefJson'> & { referenceBytes?: Buffer | null; briefJson?: CakeDesignBrief };
  delete value.referenceBytes;
  delete value.briefJson;
  const references = row.get('references') as Array<{ id: number }> | undefined;
  const hasReference = Boolean(row.referenceMime);
  return { ...value, brief: normalizeBrief(row.briefJson), hasReference, referenceCount: (hasReference ? 1 : 0) + (references?.length ?? 0), referenceIds: references?.map((reference) => reference.id) ?? [] };
};

const normalizeBrief = (brief?: Partial<CakeDesignBrief> | null): CakeDesignBrief => {
  const servings = brief?.servings === null || brief?.servings === undefined ? null : Number(brief.servings);
  const visual = cakeVisualDesignSchema.safeParse(brief?.visualDesign);
  return {
    ...(visual.success ? { visualDesign: visual.data } : {}),
    occasion: String(brief?.occasion ?? '').trim(),
    theme: String(brief?.theme ?? '').trim(),
    style: String(brief?.style ?? '').trim(),
    colors: (Array.isArray(brief?.colors) ? brief.colors : []).map((color) => String(color).trim()).filter(Boolean).slice(0, 6),
    servings: servings !== null && Number.isFinite(servings) ? Math.max(1, Math.min(500, Math.round(servings))) : null,
    message: String(brief?.message ?? '').trim(),
    budget: String(brief?.budget ?? '').trim(),
    notes: String(brief?.notes ?? '').trim(),
    flavor: String(brief?.flavor ?? '').trim(),
    filling: String(brief?.filling ?? '').trim(),
    selectedOptions: (Array.isArray(brief?.selectedOptions) ? brief.selectedOptions : []).map((entry) => ({ ...(Number.isSafeInteger(entry.optionId) ? { optionId: entry.optionId } : {}), group: String(entry.group).trim(), option: String(entry.option).trim(), quantity: Number(entry.quantity) })).filter((entry) => entry.group && entry.option && Number.isSafeInteger(entry.quantity) && entry.quantity > 0).slice(0, 30),
  };
};

const decodeReference = (dataUrl: string) => {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw ApiError.badRequest('Adjunta una imagen JPG, PNG o WebP');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > 5_000_000) throw ApiError.badRequest('La imagen debe pesar menos de 5 MB');
  const mime = match[1];
  const valid = mime === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!valid) throw ApiError.badRequest('El archivo no coincide con su formato declarado');
  return { mime, bytes };
};

export const cakeDesignService = {
  async stopWhatsapp(requestId: number, userId: number) {
    const request = await CakeDesignRequest.findOne({ where: { id: requestId, userId } });
    if (!request) throw ApiError.notFound('Solicitud no encontrada');
    request.whatsappOptInAt = null;
    await request.save();
  },
  async submit(input: { userId: number; branchId: number; productId: number; variantId: number; desiredAt: Date; selections: CakeSelection[]; description: string; brief: CakeDesignBrief; referenceDataUrl?: string; referenceDataUrls?: string[]; requestKind?: 'ADVANCED' | 'FREEFORM'; themeId?: number; themeVersion?: number; whatsappOptIn?: boolean }) {
    if (input.whatsappOptIn) {
      const user = await User.findByPk(input.userId);
      if (!whatsappRecipient(user?.phone)) throw ApiError.unprocessable('Agrega un celular válido a tu perfil para recibir avisos por WhatsApp');
    }
    const profile = await CakeProductProfile.findByPk(input.productId);
    const product = await Product.findByPk(input.productId);
    const variant = await ProductVariant.findByPk(input.variantId);
    const requestKind = input.requestKind ?? 'ADVANCED';
    const themed = input.themeId ? await loadThemeForProduct(input.themeId, input.themeVersion, input.productId) : null;
    if (themed && requestKind !== 'FREEFORM') throw ApiError.badRequest('Solicita la adaptación del modelo con el formulario a medida');
    if (!profile?.isActive || (requestKind === 'FREEFORM' ? profile.saleMode !== 'SEMI_CUSTOM' : profile.saleMode !== 'ADVANCED') || !product || product.status !== PRODUCT_STATUS.ACTIVE || !variant || !variant.isActive || variant.productId !== product.id) {
      throw ApiError.badRequest('La torta elegida no acepta esta solicitud');
    }
    const leadHours = Math.max(profile.minLeadHours, themed?.minLeadHours ?? 0);
    if (!Number.isFinite(input.desiredAt.getTime()) || input.desiredAt.getTime() < Date.now() + leadHours * 60 * 60_000) {
      throw ApiError.unprocessable(`Solicita esta torta con al menos ${leadHours} horas de anticipacion`);
    }
    if (!await Branch.findOne({ where: { id: input.branchId, isActive: true } })) throw ApiError.unprocessable('Selecciona una sucursal activa');
    let selectedOptions: CakeDesignBrief['selectedOptions'] = [];
    if (requestKind === 'FREEFORM') {
      if (themed && (Number(input.brief.servings) < themed.theme.minServings || Number(input.brief.servings) > themed.theme.maxServings)) throw ApiError.unprocessable(`Este modelo admite solicitudes de ${themed.theme.minServings} a ${themed.theme.maxServings} porciones`);
      if (!Number.isSafeInteger(input.brief.servings) || !input.brief.servings || input.brief.servings < 1 || input.brief.servings > 500 || input.selections.length) {
        throw ApiError.unprocessable('Indica entre 1 y 500 porciones; describe las opciones libres en tu solicitud');
      }
    } else {
      const validated = await customizationService.quote({ productId: input.productId, variantId: input.variantId, quantity: 1, branchId: input.branchId, selections: input.selections });
      selectedOptions = validated.selections.map((entry) => ({ optionId: entry.optionId, group: entry.groupName, option: entry.optionName, quantity: entry.quantity }));
      if (!input.referenceDataUrl) throw ApiError.badRequest('Adjunta una imagen de referencia');
    }
    const allDataUrls = [input.referenceDataUrl, ...(input.referenceDataUrls ?? [])].filter((entry): entry is string => Boolean(entry)).filter((entry, index, values) => values.indexOf(entry) === index).slice(0, 3);
    const references = allDataUrls.map(decodeReference);
    const request = await sequelize.transaction(async (transaction) => {
      const created = await CakeDesignRequest.create({
        userId: input.userId, branchId: input.branchId, productId: input.productId,
        variantId: input.variantId, desiredAt: input.desiredAt, selectionsJson: input.selections,
        description: input.description.trim(), briefJson: normalizeBrief({ ...input.brief, selectedOptions }), requestKind,
        themeSnapshotJson: themed ? snapshotTheme(themed.theme) : null,
        referenceMime: references[0]?.mime ?? null, referenceBytes: references[0]?.bytes ?? null,
        whatsappOptInAt: input.whatsappOptIn ? new Date() : null,
      }, { transaction });
      if (references.length > 1) {
        await CakeDesignReference.bulkCreate(references.slice(1).map((reference, index) => ({
          requestId: created.id, sortOrder: index + 1, mime: reference.mime, bytes: reference.bytes,
        })), { transaction });
      }
      return created;
    });
    return publicRequest(request);
  },

  async mine(userId: number) {
    const requests = await CakeDesignRequest.findAll({ where: { userId }, attributes: { exclude: ['referenceBytes'] }, include: [{ model: CakeDesignReference, as: 'references', attributes: ['id'] }], order: [['createdAt', 'DESC']] });
    return Promise.all(requests.map(async (request) => ({
      ...publicRequest(request),
      quotes: await CakeDesignQuote.findAll({ where: { requestId: request.id }, order: [['version', 'DESC']] }),
    })));
  },

  async updatePending(input: { requestId: number; userId: number; description: string; flavor: string; filling: string; message: string; notes: string }) {
    return sequelize.transaction(async (transaction) => {
      const request = await CakeDesignRequest.findOne({ where: { id: input.requestId, userId: input.userId }, transaction, lock: transaction.LOCK.UPDATE });
      if (!request) throw ApiError.notFound('Solicitud no encontrada');
      if (request.status !== 'SUBMITTED') throw ApiError.conflict('La solicitud ya está en cotización; sus detalles no se pueden cambiar');
      request.description = input.description.trim();
      request.briefJson = normalizeBrief({ ...request.briefJson, flavor: input.flavor, filling: input.filling, message: input.message, notes: input.notes });
      await request.save({ transaction });
      return publicRequest(request);
    });
  },

  async board(branchId: number) {
    const requests = await CakeDesignRequest.findAll({ where: { branchId }, attributes: { exclude: ['referenceBytes'] }, include: [{ model: CakeDesignReference, as: 'references', attributes: ['id'] }], order: [['createdAt', 'DESC']], limit: 100 });
    return Promise.all(requests.map(async (request) => ({
      ...publicRequest(request),
      quotes: await CakeDesignQuote.findAll({ where: { requestId: request.id }, order: [['version', 'DESC']] }),
    })));
  },

  async reference(requestId: number, actor: { id: number; canReview: boolean; branchIds: number[] }) {
    const request = await CakeDesignRequest.findByPk(requestId);
    if (!request) throw ApiError.notFound('Solicitud no encontrada');
    if (request.userId !== actor.id && !(actor.canReview && (!actor.branchIds.length || actor.branchIds.includes(request.branchId)))) {
      throw ApiError.forbidden('No puedes ver esta referencia');
    }
    if (!request.referenceMime || !request.referenceBytes) throw ApiError.notFound('Esta solicitud no tiene imagen de referencia');
    return { mime: request.referenceMime, bytes: request.referenceBytes };
  },

  async referenceAttachment(requestId: number, referenceId: number, actor: { id: number; canReview: boolean; branchIds: number[] }) {
    const request = await CakeDesignRequest.findByPk(requestId);
    if (!request) throw ApiError.notFound('Solicitud no encontrada');
    if (request.userId !== actor.id && !(actor.canReview && (!actor.branchIds.length || actor.branchIds.includes(request.branchId)))) {
      throw ApiError.forbidden('No puedes ver esta referencia');
    }
    const reference = await CakeDesignReference.findOne({ where: { id: referenceId, requestId } });
    if (!reference) throw ApiError.notFound('Referencia no encontrada');
    return { mime: reference.mime, bytes: reference.bytes };
  },

  async propose(input: { requestId: number; branchId: number; actorId: number; requestUpdatedAt: Date; price: number; effort: CakeEffort; proposedAt: Date; expiresAt: Date; terms: string; specification: DesignSpecification; materialExtras: Array<{ inventoryItemId: number; quantity: number }>; estimatedLaborCost: number; estimatedPackagingCost: number }) {
    const quote = await sequelize.transaction(async (transaction) => {
      const request = await CakeDesignRequest.findOne({ where: { id: input.requestId, branchId: input.branchId }, transaction, lock: transaction.LOCK.UPDATE });
      if (!request || request.status === 'REJECTED') throw ApiError.notFound('Solicitud activa no encontrada');
      if (request.updatedAt.getTime() !== input.requestUpdatedAt.getTime()) throw ApiError.conflict('El cliente actualizó su diseño. Actualiza la sección y vuelve a abrir la solicitud');
      if (request.status === 'ACCEPTED') throw ApiError.conflict('El cliente ya acepto una version');
      if (input.expiresAt <= new Date() || input.proposedAt <= new Date() || input.expiresAt >= input.proposedAt) throw ApiError.badRequest('La cotizacion debe vencer antes de la fecha propuesta');
      if (!Object.values(input.effort).some((minutes) => Number(minutes) > 0)) throw ApiError.unprocessable('Indica el tiempo de produccion de esta torta');
      const slot = await DeliverySlot.findOne({ where: { branchId: request.branchId, startsAt: input.proposedAt, isActive: true }, transaction });
      if (!slot || slot.availableCount <= 0 || slot.orderCutoffAt <= new Date()) throw ApiError.unprocessable('La fecha propuesta debe ser una franja de entrega con cupo');
      const availability = await cakeProductionService.availabilityForDesign(request.branchId, request.productId, input.effort, input.proposedAt);
      if (!availability.available) throw ApiError.unprocessable('No hay capacidad para la fecha propuesta');
      const extraIds = input.materialExtras.map((line) => line.inventoryItemId);
      if (request.requestKind === 'FREEFORM' && !extraIds.length) throw ApiError.unprocessable('Registra todos los insumos y cantidades de la torta a medida antes de cotizar');
      const materials = extraIds.length ? await InventoryItem.findAll({ where: { id: extraIds, isActive: true }, transaction }) : [];
      if (new Set(extraIds).size !== extraIds.length || materials.length !== extraIds.length) throw ApiError.unprocessable('Los materiales deben ser insumos activos sin repeticiones');
      if (request.requestKind === 'FREEFORM' && materials.some((item) => item.allergens === null)) throw ApiError.unprocessable('Clasifica los alergenos de todos los insumos antes de cotizar esta torta');
      const allergenCodesJson = request.requestKind === 'FREEFORM' ? [...new Set(materials.flatMap((item) => item.allergens ?? []))].sort() : null;
      const scope = buildDesignQuoteScope({ modelName: request.themeSnapshotJson?.name, brief: normalizeBrief(request.briefJson), specification: input.specification, conditions: input.terms });
      if (scope.length > 4000) throw ApiError.unprocessable('La especificación es demasiado extensa; resume los detalles antes de cotizar');
      const latest = await CakeDesignQuote.findOne({ where: { requestId: request.id }, order: [['version', 'DESC']], transaction, lock: transaction.LOCK.UPDATE });
      if (latest?.status === 'PROPOSED') { latest.status = 'SUPERSEDED'; await latest.save({ transaction }); }
      const quote = await CakeDesignQuote.create({
        requestId: request.id, version: (latest?.version ?? 0) + 1, price: input.price,
        effortJson: input.effort, proposedAt: input.proposedAt, expiresAt: input.expiresAt,
        terms: scope, createdBy: input.actorId, materialExtrasJson: input.materialExtras, allergenCodesJson,
        estimatedLaborCost: input.estimatedLaborCost, estimatedPackagingCost: input.estimatedPackagingCost,
      }, { transaction });
      request.status = 'QUOTED';
      await request.save({ transaction });
      return quote;
    });
    void whatsappService.notifyDesignQuote(input.requestId, quote.id)
      .catch((error) => logger.error('Fallo el aviso de cotización por WhatsApp', error));
    return quote;
  },

  async reject(requestId: number, branchId: number) {
    const request = await CakeDesignRequest.findOne({ where: { id: requestId, branchId } });
    if (!request) throw ApiError.notFound('Solicitud no encontrada');
    if (request.status === 'ACCEPTED') throw ApiError.conflict('Esta solicitud ya fue aceptada');
    request.status = 'REJECTED';
    await request.save();
    return publicRequest(request);
  },

  async accept(quoteId: number, userId: number) {
    return sequelize.transaction(async (transaction) => {
      const quote = await CakeDesignQuote.findByPk(quoteId, { transaction, lock: transaction.LOCK.UPDATE });
      const request = quote ? await CakeDesignRequest.findByPk(quote.requestId, { transaction, lock: transaction.LOCK.UPDATE }) : null;
      if (!quote || !request || request.userId !== userId) throw ApiError.notFound('Cotizacion no encontrada');
      if (quote.status !== 'PROPOSED' || quote.expiresAt <= new Date() || request.status !== 'QUOTED') throw ApiError.conflict('La cotizacion ya no esta vigente');
      const slot = await DeliverySlot.findOne({ where: { branchId: request.branchId, startsAt: quote.proposedAt, isActive: true }, transaction });
      if (!slot || slot.availableCount <= 0 || slot.orderCutoffAt <= new Date()) throw ApiError.unprocessable('La franja propuesta ya no tiene cupo');
      const availability = await cakeProductionService.availabilityForDesign(request.branchId, request.productId, quote.effortJson, quote.proposedAt, false);
      if (!availability.available) throw ApiError.unprocessable('La fecha propuesta ya no tiene capacidad; pide otra cotizacion');
      quote.status = 'ACCEPTED'; quote.acceptedAt = new Date();
      request.status = 'ACCEPTED';
      await quote.save({ transaction }); await request.save({ transaction });
      return { quote, request: publicRequest(request) };
    });
  },

  async purchasableQuote(quoteId: number, input: { userId?: number | null; branchId: number; productId: number; variantId: number; quantity: number; selections: CakeSelection[] }) {
    const quote = await CakeDesignQuote.findByPk(quoteId);
    const request = quote ? await CakeDesignRequest.findByPk(quote.requestId, { attributes: { exclude: ['referenceBytes'] } }) : null;
    if (!quote || !request || quote.status !== 'ACCEPTED' || quote.expiresAt <= new Date() || quote.orderId
      || !input.userId || request.userId !== input.userId || request.branchId !== input.branchId
      || request.productId !== input.productId || request.variantId !== input.variantId || input.quantity !== 1
      || JSON.stringify(request.selectionsJson) !== JSON.stringify(input.selections)) {
      throw ApiError.unprocessable('La cotizacion aprobada no corresponde a este carrito');
    }
    return { quote, request };
  },

  async linkOrder(quoteId: number, orderId: number, transaction: Transaction) {
    const quote = await CakeDesignQuote.findByPk(quoteId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!quote || quote.status !== 'ACCEPTED' || quote.orderId || quote.expiresAt <= new Date()) throw ApiError.conflict('La cotizacion ya fue utilizada o vencio');
    quote.orderId = orderId;
    await quote.save({ transaction });
  },

  async releaseOrder(orderId: number, transaction: Transaction) {
    const quotes = await CakeDesignQuote.findAll({ where: { orderId }, transaction, lock: transaction.LOCK.UPDATE });
    for (const quote of quotes) { quote.orderId = null; await quote.save({ transaction }); }
  },
};
