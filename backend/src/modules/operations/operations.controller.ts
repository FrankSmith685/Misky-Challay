import type { Request, Response } from 'express';
import { ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { ApiError } from '@shared/errors/ApiError';
import { branchScopeCheck, resolveBranchId } from '@shared/utils/scope';
import type { TicketStatus } from '@database/models/kitchenTicket.model';
import type { MovementType } from '@database/models/inventoryMovement.model';
import { operationsService } from './operations.service';
import { inventoryService } from './inventory.service';

const requireActor = (req: Request): number => {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.sub;
};

/** Modulo OPERATIONS (M10): cocina e inventario. */
export const operationsController = {
  board: asyncHandler(async (req: Request, res: Response) => {
    // No se confia en el branchId de la URL: se valida contra el alcance del token.
    const branchId = resolveBranchId(req, req.query.branchId as string | undefined);
    const statuses = req.query.status
      ? (String(req.query.status).split(',') as TicketStatus[])
      : undefined;

    const [tickets, scheduled, stats] = await Promise.all([
      operationsService.board(branchId, statuses),
      operationsService.scheduledBoard(branchId),
      operationsService.stats(branchId),
    ]);

    return ok(
      res,
      { tickets, scheduled, stats: { ...stats, scheduled: scheduled.length } },
      `${tickets.length} comandas activas y ${scheduled.length} programadas`,
    );
  }),

  advance: asyncHandler(async (req: Request, res: Response) => {
    const ticket = await operationsService.advance(
      Number(req.params.ticketId),
      req.body.status as TicketStatus,
      requireActor(req),
      req.body.comment,
      branchScopeCheck(req),
    );

    return ok(res, { id: ticket.id, status: ticket.status }, 'Ticket actualizado');
  }),

  stock: asyncHandler(async (req: Request, res: Response) => {
    const branchId = resolveBranchId(req, req.query.branchId as string | undefined);
    const stock = await inventoryService.listStock(branchId);
    return ok(res, stock);
  }),

  createInventoryItem: asyncHandler(async (req: Request, res: Response) => {
    const item = await inventoryService.createItem({
      branchId: resolveBranchId(req, req.body.branchId),
      code: req.body.code,
      name: req.body.name,
      unit: req.body.unit,
      unitCost: Number(req.body.unitCost),
      minLevel: Number(req.body.minLevel),
      initialStock: Number(req.body.initialStock),
      actorId: requireActor(req),
    });

    return ok(res, { id: item.id, code: item.code }, 'Insumo creado');
  }),

  adjustStock: asyncHandler(async (req: Request, res: Response) => {
    const stock = await inventoryService.adjust({
      branchId: resolveBranchId(req, req.body.branchId),
      inventoryItemId: Number(req.body.inventoryItemId),
      type: req.body.type as MovementType,
      quantity: Number(req.body.quantity),
      reason: req.body.reason,
      actorId: requireActor(req),
    });

    return ok(
      res,
      {
        onHand: Number(stock.onHand),
        reserved: Number(stock.reserved),
        available: stock.available,
      },
      'Inventario actualizado',
    );
  }),
};
