import { z } from 'zod';
import type { Transaction } from 'sequelize';
import { sequelize } from '@database/connection';
import { CheckoutTerms } from '@database/models/checkoutTerms.model';
import { ApiError } from '@shared/errors/ApiError';

export const checkoutTermsUpdateSchema = z.object({ body: z.object({
  version: z.number().int().positive(),
  title: z.string().trim().min(3).max(160),
  content: z.string().trim().min(50).max(60000),
  acceptanceLabel: z.string().trim().min(10).max(300),
}) });

const dto = (row: CheckoutTerms) => ({
  version: row.version, title: row.title, content: row.content,
  acceptanceLabel: row.acceptanceLabel, publishedAt: row.updatedAt.toISOString(),
});
export type PublishedCheckoutTerms = ReturnType<typeof dto>;
export type OrderTermsAcceptance = PublishedCheckoutTerms & { acceptedAt: string; channel: 'WEB' | 'MOBILE' };

export const checkoutTermsService = {
  async get(transaction?: Transaction, documentId = 1) {
    const row = await CheckoutTerms.findByPk(documentId, {
      transaction, ...(transaction ? { lock: transaction.LOCK.SHARE } : {}),
    });
    if (!row) throw new ApiError(503, 'Los términos de compra no están disponibles. Vuelve a intentarlo en un momento.', 'TERMS_UNAVAILABLE');
    return dto(row);
  },

  async accept(input: { termsAccepted?: boolean; termsVersion?: number; client?: 'WEB' | 'MOBILE' }, transaction: Transaction): Promise<OrderTermsAcceptance> {
    if (input.termsAccepted !== true || !Number.isInteger(input.termsVersion) || Number(input.termsVersion) < 1) {
      throw ApiError.unprocessable('Debes aceptar los términos y condiciones antes de confirmar el pedido.');
    }
    // Los pedidos pueden leer juntos; la publicación exclusiva espera a que terminen.
    const terms = await checkoutTermsService.get(transaction);
    if (input.termsVersion !== terms.version) {
      throw new ApiError(409, 'Los términos y condiciones cambiaron. Revisa y acepta la versión vigente antes de confirmar.', 'TERMS_CHANGED');
    }
    return { ...terms, acceptedAt: new Date().toISOString(), channel: input.client ?? 'WEB' };
  },

  async update(input: z.infer<typeof checkoutTermsUpdateSchema>['body'], actorId: number, documentId = 1) {
    const validated = checkoutTermsUpdateSchema.parse({ body: input }).body;
    return sequelize.transaction(async (transaction) => {
      const row = await CheckoutTerms.findByPk(documentId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!row || row.version !== validated.version) {
        throw ApiError.conflict('Otra persona publicó cambios. Recarga los términos antes de publicar tu versión.');
      }
      const before = dto(row);
      if (row.title === validated.title && row.content === validated.content && row.acceptanceLabel === validated.acceptanceLabel) return { before, after: before };
      await row.update({ ...validated, version: row.version + 1, updatedBy: actorId }, { transaction });
      return { before, after: dto(row) };
    });
  },
};
