import { z } from 'zod';
import { Order, sequelize } from '@database/models';
import { ApiError } from '@shared/errors/ApiError';
import type { BranchScopeCheck } from '@shared/utils/scope';

export const orderContactBody = z.object({ channel: z.enum(['WHATSAPP', 'EMAIL', 'PHONE', 'IN_PERSON']), note: z.string().trim().max(1000).default('') });
export interface CustomerContactRecord { contactedAt: string; actorId: number; channel: 'WHATSAPP' | 'EMAIL' | 'PHONE' | 'IN_PERSON'; note: string }

export const orderContactService = {
  async record(orderNumber: string, input: z.infer<typeof orderContactBody>, actorId: number, scopeCheck: BranchScopeCheck) {
    const validated = orderContactBody.parse(input);
    return sequelize.transaction(async (transaction) => {
      const order = await Order.findOne({ where: { orderNumber }, transaction, lock: transaction.LOCK.UPDATE });
      if (!order) throw ApiError.notFound('Pedido no encontrado');
      scopeCheck(order.branchId);
      if (order.customerContactJson) return { record: order.customerContactJson, reused: true };
      const record: CustomerContactRecord = { ...validated, actorId, contactedAt: new Date().toISOString() };
      await order.update({ customerContactJson: record }, { transaction });
      return { record, reused: false };
    });
  },
};
