import type { Request, Response } from 'express';
import { Op } from 'sequelize';
import { AppEvent, User } from '@database/models';
import { verifyAccessToken } from '@shared/utils/jwt';
import { activityVisible } from './activity.service';

export function monitorStreamSession(req: Request, res: Response) {
  const token = req.headers.authorization?.replace(/^Bearer /, '') ?? req.cookies?.accessToken;
  const actor = req.user!;
  const timer = setInterval(() => {
    void (async () => {
      try {
        verifyAccessToken(String(token));
        const user = await User.findByPk(actor.sub, { attributes: ['status', 'tokenVersion'] });
        if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== actor.tv) res.end();
      } catch { res.end(); }
    })();
  }, 15000);
  const rotate = setTimeout(() => res.end(), 5 * 60000);
  res.once('close', () => { clearInterval(timer); clearTimeout(rotate); });
}

/** Database-backed invalidations work across processes. Only topic names leave this stream. */
export async function activityStream(req: Request, res: Response) {
  const token = req.headers.authorization?.replace(/^Bearer /, '') ?? req.cookies?.accessToken;
  const actor = req.user;
  let cursor = Number(req.query.after) || Number(await AppEvent.max('id')) || 0;
  let closed = false;
  let running = false;
  res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const write = (data: unknown) => { if (!closed) { res.write(`data: ${JSON.stringify(data)}\n\n`); (res as Response & { flush?: () => void }).flush?.(); } };
  write({ topics: ['resync'], id: cursor });
  const tick = async () => {
    if (running || closed) return;
    running = true;
    try {
      if (actor) {
        const current = verifyAccessToken(String(token));
        const user = await User.findByPk(actor.sub, { attributes: ['status', 'tokenVersion'] });
        if (current.sub !== actor.sub || !user || user.status !== 'ACTIVE' || user.tokenVersion !== actor.tv) { res.end(); return; }
      }
      const rows = await AppEvent.findAll({ where: { id: { [Op.gt]: cursor } }, order: [['id', 'ASC']], limit: 300 });
      const topics = [...new Set(rows.filter((row) => actor ? activityVisible(actor, row) : ['catalog', 'settings', 'coverage', 'availability'].includes(row.topic)).map((row) => row.topic))];
      if (rows.length) cursor = rows[rows.length - 1].id;
      if (topics.length) write({ topics, id: cursor });
      else if (!closed) res.write(': heartbeat\n\n');
    } catch { res.end(); }
    finally { running = false; }
  };
  const timer = setInterval(() => void tick(), 2000);
  const rotate = setTimeout(() => res.end(), 5 * 60000);
  res.once('close', () => { closed = true; clearInterval(timer); clearTimeout(rotate); });
}
