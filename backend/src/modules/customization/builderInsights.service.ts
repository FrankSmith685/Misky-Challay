import { Op, QueryTypes } from 'sequelize';
import {
  AuditLog,
  BuilderEvent,
  BuilderPreset,
  CustomizationOption,
  User,
  sequelize,
} from '@database/models';
import type { BuilderEventType } from '@database/models/builderEvent.model';

const startDate = (days: number): Date => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

export const builderInsightsService = {
  async track(input: {
    sessionId: string;
    userId?: number | null;
    productId: number;
    eventType: BuilderEventType;
    groupId?: number | null;
    optionId?: number | null;
    presetId?: number | null;
    metadata?: Record<string, unknown> | null;
  }) {
    return BuilderEvent.create({
      sessionId: input.sessionId,
      userId: input.userId ?? null,
      productId: input.productId,
      eventType: input.eventType,
      groupId: input.groupId ?? null,
      optionId: input.optionId ?? null,
      presetId: input.presetId ?? null,
      metadata: input.metadata ?? null,
    });
  },

  async analytics(productId: number, days = 30) {
    const from = startDate(days);
    const events = await BuilderEvent.findAll({
      where: { productId, createdAt: { [Op.gte]: from } },
      attributes: ['sessionId', 'eventType', 'optionId', 'presetId', 'createdAt'],
      order: [['createdAt', 'ASC']],
    });

    const sessionsByType = new Map<string, Set<string>>();
    const optionCounts = new Map<number, number>();
    const presetCounts = new Map<number, number>();
    for (const event of events) {
      const set = sessionsByType.get(event.eventType) ?? new Set<string>();
      set.add(event.sessionId);
      sessionsByType.set(event.eventType, set);
      if (event.eventType === 'OPTION_SELECT' && event.optionId) {
        optionCounts.set(event.optionId, (optionCounts.get(event.optionId) ?? 0) + 1);
      }
      if (event.eventType === 'PRESET_APPLY' && event.presetId) {
        presetCounts.set(event.presetId, (presetCounts.get(event.presetId) ?? 0) + 1);
      }
    }

    const optionIds = [...optionCounts.keys()];
    const presetIds = [...presetCounts.keys()];
    const [options, presets, orderedIngredients] = await Promise.all([
      optionIds.length ? CustomizationOption.findAll({ where: { id: optionIds }, attributes: ['id', 'name'] }) : [],
      presetIds.length ? BuilderPreset.findAll({ where: { id: presetIds }, attributes: ['id', 'name'] }) : [],
      sequelize.query<{ optionId: number; name: string; units: number; extras: number }>(
        `SELECT oic.option_id AS optionId, oic.option_name_snapshot AS name,
                SUM(oic.quantity) AS units, SUM(oic.line_extra) AS extras
         FROM order_item_customizations oic
         INNER JOIN order_items oi ON oi.id = oic.order_item_id
         INNER JOIN orders o ON o.id = oi.order_id
         WHERE oi.product_id = :productId AND o.created_at >= :from
           AND o.status NOT IN ('CANCELLED', 'PENDING_PAYMENT')
         GROUP BY oic.option_id, oic.option_name_snapshot
         ORDER BY units DESC LIMIT 12`,
        { replacements: { productId, from }, type: QueryTypes.SELECT },
      ),
    ]);
    const optionNames = new Map(options.map((option) => [option.id, option.name]));
    const presetNames = new Map(presets.map((preset) => [preset.id, preset.name]));

    const viewed = sessionsByType.get('VIEW')?.size ?? 0;
    const started = sessionsByType.get('START')?.size ?? 0;
    const completed = sessionsByType.get('COMPLETE')?.size ?? 0;
    const added = sessionsByType.get('ADD_TO_CART')?.size ?? 0;
    const percent = (value: number, base: number) => base ? Math.round((value / base) * 100) : 0;

    return {
      range: { from, to: new Date(), days },
      funnel: {
        viewed,
        started,
        completed,
        addedToCart: added,
        startRate: percent(started, viewed),
        completionRate: percent(completed, started),
        conversionRate: percent(added, viewed),
        abandonmentRate: viewed ? Math.max(0, 100 - percent(added, viewed)) : 0,
      },
      interactions: {
        conflictsResolved: sessionsByType.get('CONFLICT_RESOLVE')?.size ?? 0,
        quoteErrors: sessionsByType.get('QUOTE_ERROR')?.size ?? 0,
        savedBowls: sessionsByType.get('SAVE_BOWL')?.size ?? 0,
      },
      topSelectedOptions: [...optionCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([id, count]) => ({ id, name: optionNames.get(id) ?? `Opción #${id}`, count })),
      presetUsage: [...presetCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id, count]) => ({ id, name: presetNames.get(id) ?? `Preset #${id}`, count })),
      orderedIngredients: orderedIngredients.map((row) => ({
        optionId: Number(row.optionId),
        name: row.name,
        units: Number(row.units),
        extras: Number(row.extras),
      })),
    };
  },

  async history(limit = 100) {
    const rows = await AuditLog.findAll({
      where: { action: { [Op.like]: 'builder.%' } },
      include: [{ model: User, as: 'actor', attributes: ['id', 'firstName', 'lastName', 'email'], required: false }],
      order: [['createdAt', 'DESC']],
      limit,
    });
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      before: row.beforeJson,
      after: row.afterJson,
      actor: row.get('actor') ?? null,
      createdAt: row.createdAt,
    }));
  },
};
