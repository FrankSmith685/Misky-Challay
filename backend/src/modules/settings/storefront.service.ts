import { Op } from 'sequelize';
import { StorefrontSetting, AdminDraft, AuditLog } from '@database/models';
import { sequelize } from '@database/connection';
import { ApiError } from '@shared/errors/ApiError';
import { defaultStorefront, storefrontSchema, type StorefrontContent } from './storefront.schema';

export const STOREFRONT_DRAFT_KEY = 'storefront:global';

type DraftPayload = { content: StorefrontContent; baseVersion: number };

const dto = (row: StorefrontSetting | null) => ({
  content: row ? storefrontSchema.parse(row.contentJson) : defaultStorefront(),
  version: row?.version ?? 0,
  updatedAt: row?.updatedAt?.toISOString() ?? null,
});

const draftDto = (row: AdminDraft | null) => {
  if (!row) return null;
  const payload = row.payload as unknown as Partial<DraftPayload>;
  const parsed = storefrontSchema.safeParse(payload.content);
  if (!parsed.success) return null;
  return {
    content: parsed.data,
    baseVersion: Number.isInteger(payload.baseVersion) ? payload.baseVersion : 0,
    status: row.status,
    publishAt: row.publishAt?.toISOString() ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? null,
    ownerUserId: row.ownerUserId,
  };
};

const findDraft = () => AdminDraft.findOne({
  where: { key: STOREFRONT_DRAFT_KEY, status: { [Op.in]: ['DRAFT', 'SCHEDULED'] } },
});

export const storefrontService = {
  async get() {
    return dto(await StorefrontSetting.findByPk(1));
  },

  async getAdmin() {
    const [row, draft] = await Promise.all([StorefrontSetting.findByPk(1), findDraft()]);
    return { published: dto(row), draft: draftDto(draft) };
  },

  async saveDraft(content: StorefrontContent, baseVersion: number, actorId: number, publishAt?: string | null) {
    const validated = storefrontSchema.parse(content);
    const row = await StorefrontSetting.findByPk(1);
    if ((row?.version ?? 0) !== baseVersion) {
      throw ApiError.conflict('La portada publicada cambió. Recarga el contenido para conservar la versión más reciente.');
    }
    const scheduledAt = publishAt ? new Date(publishAt) : null;
    if (scheduledAt && (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now())) {
      throw ApiError.badRequest('La fecha de publicación debe ser futura.');
    }
    const status = scheduledAt ? 'SCHEDULED' as const : 'DRAFT' as const;
    const [draft] = await AdminDraft.findOrCreate({
      where: { key: STOREFRONT_DRAFT_KEY },
      defaults: {
        key: STOREFRONT_DRAFT_KEY,
        scope: 'storefront',
        ownerUserId: actorId,
        payload: { content: validated, baseVersion },
        publishAt: scheduledAt,
        status,
        errorMessage: null,
      },
    });
    await draft.update({
      scope: 'storefront', ownerUserId: actorId, payload: { content: validated, baseVersion },
      publishAt: scheduledAt, status, errorMessage: null,
    });
    return this.getAdmin();
  },

  async discardDraft() {
    await AdminDraft.destroy({ where: { key: STOREFRONT_DRAFT_KEY } });
    return this.getAdmin();
  },

  async publishDraft(actorId: number, idempotencyKey?: string | null, draftOverride?: AdminDraft) {
    return sequelize.transaction(async (transaction) => {
      const row = await StorefrontSetting.findByPk(1, { transaction, lock: transaction.LOCK.UPDATE });
      if (idempotencyKey && row?.lastPublishKey === idempotencyKey) return { before: dto(row), after: dto(row), reused: true };
      const draft = draftOverride ?? await AdminDraft.findOne({
        where: { key: STOREFRONT_DRAFT_KEY, status: { [Op.in]: ['DRAFT', 'SCHEDULED'] } }, transaction,
      });
      if (!draft) throw ApiError.notFound('No hay un borrador de la portada para publicar.');
      const payload = draft.payload as unknown as DraftPayload;
      const content = storefrontSchema.parse(payload.content);
      if ((row?.version ?? 0) !== payload.baseVersion) {
        throw ApiError.conflict('La portada publicada cambió mientras editabas. Conservamos tu borrador para que puedas revisarlo.');
      }
      const before = dto(row);
      const saved = row
        ? await row.update({ contentJson: content, version: row.version + 1, updatedBy: actorId, lastPublishKey: idempotencyKey ?? null }, { transaction })
        : await StorefrontSetting.create({ id: 1, contentJson: content, version: 1, updatedBy: actorId, lastPublishKey: idempotencyKey ?? null }, { transaction });
      await draft.update({ status: 'PUBLISHED', publishAt: null, errorMessage: null }, { transaction });
      return { before, after: dto(saved), reused: false };
    });
  },

  /** Mantiene la compatibilidad con integraciones antiguas que publican de una vez. */
  async update(content: StorefrontContent, version: number, actorId: number, idempotencyKey?: string | null) {
    const validated = storefrontSchema.parse(content);
    return sequelize.transaction(async (transaction) => {
      const row = await StorefrontSetting.findByPk(1, { transaction, lock: transaction.LOCK.UPDATE });
      if (idempotencyKey && row?.lastPublishKey === idempotencyKey) return { before: dto(row), after: dto(row), reused: true };
      if ((row?.version ?? 0) !== version) {
        throw ApiError.conflict('Otra persona actualizó la portada. Recarga el contenido antes de guardar tus cambios.');
      }
      const before = dto(row);
      const saved = row
        ? await row.update({ contentJson: validated, version: version + 1, updatedBy: actorId, lastPublishKey: idempotencyKey ?? null }, { transaction })
        : await StorefrontSetting.create({ id: 1, contentJson: validated, version: 1, updatedBy: actorId, lastPublishKey: idempotencyKey ?? null }, { transaction });
      return { before, after: dto(saved), reused: false };
    });
  },

  async history(limit = 20) {
    const rows = await AuditLog.findAll({ where: { entity: 'storefront_settings', action: { [Op.in]: ['STOREFRONT_PUBLISHED', 'STOREFRONT_UPDATED', 'STOREFRONT_ROLLBACK', 'STOREFRONT_PUBLISHED_SCHEDULED'] } }, order: [['id', 'DESC']], limit });
    return rows.map((row) => ({
      id: row.id, action: row.action, actorId: row.actorId, createdAt: row.createdAt,
      before: row.beforeJson, after: row.afterJson,
    }));
  },

  async rollback(auditId: number, actorId: number, idempotencyKey?: string | null) {
    const log = await AuditLog.findOne({ where: { id: auditId, entity: 'storefront_settings' } });
    const content = storefrontSchema.safeParse((log?.afterJson as { content?: unknown } | null)?.content);
    if (!content.success) throw ApiError.badRequest('La versión seleccionada ya no contiene un documento válido.');
    const row = await StorefrontSetting.findByPk(1);
    const result = await this.update(content.data, row?.version ?? 0, actorId, idempotencyKey);
    await AdminDraft.destroy({ where: { key: STOREFRONT_DRAFT_KEY } });
    return result;
  },
};
