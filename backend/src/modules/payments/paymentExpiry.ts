import { QueryTypes, type Transaction } from 'sequelize';
import { sequelize } from '@database/connection';
import { sqlUtcDatetime } from '@shared/utils/datetime';

/** Reports and unexpired direct payments are excluded before LIMIT, preserving queue progress. */
export const findPaymentExpiryCandidates = (
  cutoff: Date,
  now = new Date(),
  transaction?: Transaction,
) =>
  sequelize.query<{ id: number }>(
    `
  SELECT o.id FROM orders o WHERE o.status = 'PENDING_PAYMENT' AND o.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM payments p JOIN mobile_payment_claims c ON c.payment_id = p.id
    WHERE p.payable_type = 'ORDER' AND p.payable_id = o.id AND p.status = 'PENDING'
    AND c.status IN ('PENDING', 'OBSERVED')
  )
  AND NOT EXISTS (
    SELECT 1 FROM payments p WHERE p.payable_type = 'ORDER' AND p.payable_id = o.id
    AND p.provider IN ('yape', 'plin') AND p.status = 'PENDING'
    AND JSON_UNQUOTE(JSON_EXTRACT(p.safe_response_json, '$.directPayment.expiresAt')) > :now
  )
  AND (o.placed_at < :cutoff OR EXISTS (
    SELECT 1 FROM payments p WHERE p.payable_type = 'ORDER' AND p.payable_id = o.id
    AND p.provider IN ('yape', 'plin') AND p.status = 'PENDING'
    AND JSON_UNQUOTE(JSON_EXTRACT(p.safe_response_json, '$.directPayment.expiresAt')) <= :now
  )) ORDER BY o.placed_at ASC LIMIT 100`,
    {
      replacements: { cutoff: sqlUtcDatetime(cutoff), now: now.toISOString() },
      type: QueryTypes.SELECT,
      transaction,
    },
  );
