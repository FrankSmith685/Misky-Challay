import { Op, type WhereOptions } from 'sequelize';
import { Notification, Order } from '@database/models';
import type { TokenPayload } from '@shared/utils/jwt';

export type FeedAudience = 'CUSTOMER' | 'STAFF' | 'ALL';
export function feedWhere(actor: TokenPayload, audience: FeedAudience = 'ALL'): WhereOptions {
  const staff: WhereOptions = { audience: 'STAFF', ...(!actor.isSuperAdmin ? { [Op.and]: [
      { [Op.or]: [{ permissionCode: null }, { permissionCode: actor.permissions }] },
      ...(actor.branchIds.length ? [{ [Op.or]: [{ branchId: null }, { branchId: actor.branchIds }] }] : []),
    ] } : {}) };
  return { userId: actor.sub, channel: 'IN_APP', status: 'SENT', ...(audience === 'STAFF' ? staff : audience === 'CUSTOMER' ? { audience: 'CUSTOMER' } : { [Op.or]: [{ audience: 'CUSTOMER' }, staff] }) };
}
export const notificationFeed = {
  async list(actor: TokenPayload, audience: FeedAudience, page = 1, pageSize = 15) {
    const where = feedWhere(actor, audience);
    const [result, unreadCount, newestId] = await Promise.all([
      Notification.findAndCountAll({ where, order: [['id', 'DESC']], limit: pageSize, offset: (page - 1) * pageSize, include: [{ model: Order, as: 'order', attributes: ['orderNumber', 'status'] }] }),
      Notification.count({ where: { [Op.and]: [where, { readAt: null }] } }),
      Notification.max('id', { where }),
    ]);
    return { items: result.rows, unreadCount, newestId: Number(newestId) || 0, page, pageSize, total: result.count, totalPages: Math.max(1, Math.ceil(result.count / pageSize)) };
  },
  async read(actor: TokenPayload, input: { ids?: number[]; all?: boolean; throughId?: number; audience?: FeedAudience }) {
    if (!input.all && !input.ids?.length) return;
    await Notification.update({ readAt: new Date() }, { individualHooks: true, where: { [Op.and]: [
      feedWhere(actor, input.audience), { readAt: null },
      ...(input.ids?.length ? [{ id: input.ids }] : []),
      ...(input.throughId ? [{ id: { [Op.lte]: input.throughId } }] : []),
    ] } });
  },
};
