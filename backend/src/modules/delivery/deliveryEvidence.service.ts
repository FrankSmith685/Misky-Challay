import { Delivery, DeliveryEvidence } from '@database/models';
import { ApiError } from '@shared/errors/ApiError';
import type { BranchScopeCheck } from '@shared/utils/scope';
import { decodeCakeOrderReference } from '@modules/cakes/cakeOrderReference';

export const deliveryEvidenceService = {
  async authorize(id: number, scope: BranchScopeCheck, onlyDriverIds?: number[]) {
    const delivery = await Delivery.findByPk(id);
    if (!delivery) throw ApiError.notFound('Reparto no encontrado');
    scope(delivery.branchId);
    if (onlyDriverIds && (!delivery.driverId || !onlyDriverIds.includes(delivery.driverId))) throw ApiError.forbidden('Este reparto no está asignado a tu cuenta');
    return delivery;
  },
  async upload(id: number, stage: 'DEPARTURE' | 'ARRIVAL', dataUrl: string, actorId: number, scope: BranchScopeCheck, onlyDriverIds?: number[]) {
    const delivery = await deliveryEvidenceService.authorize(id, scope, onlyDriverIds);
    const allowed = stage === 'DEPARTURE' ? ['ASSIGNED', 'PICKED_UP'] : ['PICKED_UP', 'ON_ROUTE'];
    if (!allowed.includes(delivery.status)) throw ApiError.unprocessable('La foto no corresponde al estado actual del reparto');
    const image = decodeCakeOrderReference(dataUrl);
    await DeliveryEvidence.upsert({ deliveryId: id, stage, mime: image.mime, bytes: image.bytes, createdBy: actorId });
  },
  async read(id: number, stage: 'DEPARTURE' | 'ARRIVAL', scope: BranchScopeCheck, onlyDriverIds?: number[]) {
    await deliveryEvidenceService.authorize(id, scope, onlyDriverIds);
    const image = await DeliveryEvidence.findOne({ where: { deliveryId: id, stage } });
    if (!image) throw ApiError.notFound('Todavía no hay foto para esta etapa');
    return image;
  },
};
