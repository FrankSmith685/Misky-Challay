import { StorefrontSetting } from '@database/models/storefrontSetting.model';
import { sequelize } from '@database/connection';
import { ApiError } from '@shared/errors/ApiError';
import { defaultStorefront, storefrontSchema, type StorefrontContent } from './storefront.schema';

const dto = (row: StorefrontSetting | null) => ({
  content: row ? storefrontSchema.parse(row.contentJson) : defaultStorefront(),
  version: row?.version ?? 0,
  updatedAt: row?.updatedAt?.toISOString() ?? null,
});

export const storefrontService = {
  async get() {
    return dto(await StorefrontSetting.findByPk(1));
  },
  async update(content: StorefrontContent, version: number, actorId: number) {
    const validated = storefrontSchema.parse(content);
    return sequelize.transaction(async (transaction) => {
      const row = await StorefrontSetting.findByPk(1, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if ((row?.version ?? 0) !== version) {
        throw ApiError.conflict(
          'Otra persona actualizó la portada. Recarga el contenido antes de guardar tus cambios.',
        );
      }
      const before = dto(row);
      const saved = row
        ? await row.update(
            { contentJson: validated, version: version + 1, updatedBy: actorId },
            { transaction },
          )
        : await StorefrontSetting.create(
            { id: 1, contentJson: validated, version: 1, updatedBy: actorId },
            { transaction },
          );
      return { before, after: dto(saved) };
    });
  },
};
