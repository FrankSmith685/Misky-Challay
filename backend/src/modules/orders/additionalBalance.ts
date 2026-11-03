import type { Transaction } from 'sequelize';
import { CustomerOrderCase } from '@database/models/customerJourney.model';
/** A new accepted change may add a balance after the original balance was paid. */
export async function hasAdditionalBalance(
  orderId: number,
  priorPaymentId: number,
  transaction?: Transaction,
) {
  const cases = await CustomerOrderCase.findAll({
    where: { orderId, kind: 'CHANGE', status: 'ACCEPTED' },
    transaction,
  });
  return cases.some(
    (entry) =>
      Number(entry.payloadJson.additionalBalance) > 0 &&
      Number(entry.payloadJson.priorBalancePaymentId) === priorPaymentId,
  );
}
