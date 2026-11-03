import type { Model, Transaction } from 'sequelize';
import { CakeDesignQuote, CakeDesignRequest, CakeDesignReference, Order, OrderItem, OrderItemReference } from '@database/models';
import { PERMISSIONS } from '@config/constants';
import { ApiError } from '@shared/errors/ApiError';
import type { TokenPayload } from '@shared/utils/jwt';
import { decodeCakeOrderReference } from './cakeOrderReference';

export const orderDesignImages = (item: Model) =>
  ((item.get('designImages') as OrderItemReference[] | undefined) ?? []).map((image) => ({ id: image.id, kind: image.kind, position: image.position }));

export const cakeOrderImagesService = {
  async save(orderItemId: number, input: { designQuoteId?: number; referenceDataUrl?: string; aiProposalDataUrl?: string }, family: string | undefined, transaction: Transaction) {
    if (input.designQuoteId) {
      // The accepted quote owns these references. Never trust replacements sent from the cart.
      const quote = await CakeDesignQuote.findByPk(input.designQuoteId, { transaction });
      const request = quote ? await CakeDesignRequest.findByPk(quote.requestId, { transaction }) : null;
      if (!request) throw ApiError.conflict('La solicitud del diseño aprobado ya no está disponible');
      if (request.referenceMime && request.referenceBytes) {
        await OrderItemReference.create({ orderItemId, kind: 'CUSTOMER_REFERENCE', position: 0, mime: request.referenceMime, bytes: request.referenceBytes }, { transaction });
      }
      const extra = await CakeDesignReference.findAll({ where: { requestId: request.id }, order: [['sortOrder', 'ASC']], transaction });
      for (let index = 0; index < extra.length; index++) {
        await OrderItemReference.create({ orderItemId, kind: 'CUSTOMER_REFERENCE', position: index + 1, mime: extra[index].mime, bytes: extra[index].bytes }, { transaction });
      }
      return;
    }
    if ((input.referenceDataUrl || input.aiProposalDataUrl) && family !== 'CAKE') throw ApiError.badRequest('Las imágenes del diseño solo corresponden a tortas');
    for (const [kind, dataUrl] of [['CUSTOMER_REFERENCE', input.referenceDataUrl], ['AI_PROPOSAL', input.aiProposalDataUrl]] as const) {
      if (!dataUrl) continue;
      const image = decodeCakeOrderReference(dataUrl);
      await OrderItemReference.create({ orderItemId, kind, position: 0, ...image }, { transaction });
    }
  },

  async read(orderNumber: string, itemId: number, actor: TokenPayload, imageId?: number) {
    const order = await Order.findOne({ where: { orderNumber } });
    if (!order) throw ApiError.notFound('Pedido no encontrado');
    const staff = actor.isSuperAdmin || actor.permissions.includes(PERMISSIONS.ORDER_READ) || actor.permissions.includes(PERMISSIONS.KITCHEN_READ);
    const scope = actor.branchIds ?? [];
    const branchAllowed = actor.isSuperAdmin || !scope.length || scope.includes(order.branchId);
    if (order.userId !== actor.sub && (!staff || !branchAllowed)) throw ApiError.notFound('Pedido no encontrado');
    const item = await OrderItem.findOne({ where: { id: itemId, orderId: order.id } });
    if (!item) throw ApiError.notFound('Producto no encontrado');
    const image = await OrderItemReference.findOne({ where: { orderItemId: item.id, ...(imageId ? { id: imageId } : { kind: 'CUSTOMER_REFERENCE', position: 0 }) } });
    if (!image) throw ApiError.notFound('Imagen no encontrada');
    return image;
  },
};
