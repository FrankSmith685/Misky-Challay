import { monitorStreamSession } from '@modules/notifications/activityStream';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '@middlewares/auth.middleware';
import { requireAnyPermission, requirePermissions } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import { PERMISSIONS } from '@config/constants';
import { TICKET_STATUS } from '@database/models/kitchenTicket.model';
import { Allergen } from '@database/models';
import { ApiError } from '@shared/errors/ApiError';
import { ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { resolveBranchId } from '@shared/utils/scope';
import { audit } from '@shared/utils/audit';
import { operationsController } from './operations.controller';
import { inventoryService } from './inventory.service';
import { procurementService } from './procurement.service';
import { diningService } from './dining.service';
import { subscribeKitchenEvents, type KitchenRealtimeEvent } from './kitchenEvents';
import { kitchenPushService } from './kitchenPush.service';

/**
 * Modulo OPERATIONS (M10) - Cocina e inventario.
 * Prefijo: /api/v1/operations
 * Todo exige sesion y permisos: es zona de personal.
 */
const router = Router();
const inventoryQuantity = z.coerce.number().finite().min(0).max(9_999_999_999.99)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, 'Usa como máximo dos decimales');
const inventoryCost = z.coerce.number().finite().min(0).max(99_999_999.9999)
  .refine((value) => Math.abs(value * 10_000 - Math.round(value * 10_000)) < 0.000001, 'Usa como máximo cuatro decimales');

const diningItemsSchema = z.array(z.object({
  productId: z.coerce.number().int().positive(),
  variantId: z.coerce.number().int().positive(),
  offeringId: z.coerce.number().int().positive().optional(),
  quantity: z.coerce.number().int().min(1).max(20),
  specialInstructions: z.string().trim().max(255).optional(),
  selections: z.array(z.object({ optionId: z.coerce.number().int().positive(), quantity: z.coerce.number().int().min(1).max(20) })).optional(),
})).min(1).max(50);

// La carta QR usa un token aleatorio de capacidad, no una sesiÃ³n del cliente.
// Debe declararse antes del middleware de personal.
router.get(
  '/dining/qr/:token',
  validate(z.object({ params: z.object({ token: z.string().uuid() }) })),
  asyncHandler(async (req: Request, res: Response) => ok(res, await diningService.publicTable(req.params.token))),
);

/*
 * Pedido desde el QR de la mesa. Es publico y AÑADE a la comanda abierta, asi
 * que un reenvio sin clave hace que cocina prepare dos veces lo mismo: la clave
 * de idempotencia se acepta en el cuerpo y tambien en la cabecera estandar
 * `Idempotency-Key`, que es la que manda la app movil.
 */
router.post(
  '/dining/qr/:token/orders',
  validate(z.object({
    params: z.object({ token: z.string().uuid() }),
    body: z.object({
      guestName: z.string().trim().max(120).optional().nullable(),
      notes: z.string().trim().max(500).optional().nullable(),
      items: diningItemsSchema,
      idempotencyKey: z.string().trim().min(8).max(120).optional(),
    }),
  })),
  asyncHandler(async (req: Request, res: Response) => {
    const header = req.get('Idempotency-Key')?.trim();
    // El cuerpo manda; la cabecera es el respaldo para clientes que solo la usan.
    const idempotencyKey =
      req.body.idempotencyKey ?? (header && header.length >= 8 ? header.slice(0, 120) : null);

    return ok(
      res,
      await diningService.publicOrder(req.params.token, { ...req.body, idempotencyKey }),
      'Pedido de mesa enviado a cocina',
    );
  }),
);

router.use(authenticate);

/**
 * "Cancelar" en el tablero de cocina no cancela un ticket: cancela EL PEDIDO
 * PAGADO entero (arrastra el pedido a CANCELLED, libera el cupon y devuelve el
 * saldo). Operar la cocina no basta para eso, asi que la accion mas destructiva
 * del panel exige ademas el permiso que la gobierna. Va DESPUES de `validate`
 * porque necesita el cuerpo ya parseado.
 */
const requireOrderCancelToCancelTicket = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (req.body?.status !== TICKET_STATUS.CANCELLED) {
    next();
    return;
  }

  requirePermissions(PERMISSIONS.ORDER_CANCEL)(req, res, next);
};

// --- Cocina ---
router.get(
  '/kitchen/board',
  requirePermissions(PERMISSIONS.KITCHEN_READ),
  validate(
    z.object({
      query: z.object({
        branchId: z.coerce.number().int().positive(),
        status: z.string().optional(),
      }),
    }),
  ),
  operationsController.board,
);

/**
 * Canal SSE autenticado. Se usa `fetch` en el navegador (y no EventSource)
 * porque la sesion vive en Authorization: Bearer; poner el JWT en la URL lo
 * filtraria a historiales, proxies y herramientas de analitica.
 */
router.get(
  '/kitchen/stream',
  requirePermissions(PERMISSIONS.KITCHEN_READ),
  validate(z.object({ query: z.object({ branchId: z.coerce.number().int().positive() }) })),
  asyncHandler(async (req: Request, res: Response) => {
    const branchId = resolveBranchId(req, req.query.branchId as string | undefined);
    monitorStreamSession(req, res);
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write('retry: 3000\n\n');

    const write = (event: KitchenRealtimeEvent) => {
      res.write(`id: ${event.id}\n`);
      res.write(`event: ${event.type.toLowerCase()}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    const unsubscribe = subscribeKitchenEvents(branchId, write);
    const heartbeat = setInterval(() => {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    }, 20_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }),
);

router.get(
  '/kitchen/push/config',
  requirePermissions(PERMISSIONS.KITCHEN_READ),
  asyncHandler(async (_req: Request, res: Response) => ok(res, kitchenPushService.config())),
);

router.post(
  '/kitchen/push/subscriptions',
  requirePermissions(PERMISSIONS.KITCHEN_READ),
  validate(z.object({ body: z.object({
    branchId: z.coerce.number().int().positive(),
    endpoint: z.string().url().max(2_000),
    keys: z.object({ p256dh: z.string().min(20).max(255), auth: z.string().min(8).max(255) }),
  }) })),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const subscription = await kitchenPushService.subscribe({
      endpoint: req.body.endpoint,
      p256dh: req.body.keys.p256dh,
      auth: req.body.keys.auth,
      userId: req.user.sub,
      branchId: resolveBranchId(req, req.body.branchId),
      userAgent: req.headers['user-agent'],
    });
    return ok(res, { id: subscription.id, branchId: subscription.branchId }, 'Alertas del dispositivo activadas');
  }),
);

router.delete(
  '/kitchen/push/subscriptions',
  requirePermissions(PERMISSIONS.KITCHEN_READ),
  validate(z.object({ body: z.object({ endpoint: z.string().url().max(2_000) }) })),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    await kitchenPushService.unsubscribe(req.body.endpoint, req.user.sub);
    return ok(res, null, 'Alertas del dispositivo desactivadas');
  }),
);

router.post(
  '/kitchen/tickets/:ticketId/advance',
  requirePermissions(PERMISSIONS.KITCHEN_OPERATE),
  validate(
    z.object({
      params: z.object({ ticketId: z.coerce.number().int().positive() }),
      body: z
        .object({
          status: z.enum(['ACCEPTED', 'PREPARING', 'READY', 'DISPATCHED', 'CANCELLED']),
          comment: z.string().trim().max(255).optional(),
        })
        // El motivo es lo unico que le queda al cliente y a soporte para saber por
        // que se tiro un pedido ya cobrado: se guarda en el evento del ticket y en
        // `order.cancelReason`.
        .refine(
          (body) => body.status !== TICKET_STATUS.CANCELLED || (body.comment?.length ?? 0) >= 3,
          { message: 'Explica por que se cancela el pedido', path: ['comment'] },
        ),
    }),
  ),
  requireOrderCancelToCancelTicket,
  operationsController.advance,
);

// --- Salón y comandas ---
router.get(
  '/dining/tables',
  requirePermissions(PERMISSIONS.DINING_READ),
  validate(z.object({ query: z.object({ branchId: z.coerce.number().int().positive() }) })),
  asyncHandler(async (req: Request, res: Response) => {
    const branchId = resolveBranchId(req, req.query.branchId as string | undefined);
    return ok(res, await diningService.tables(branchId));
  }),
);

router.get(
  '/dining/catalog',
  requirePermissions(PERMISSIONS.DINING_OPERATE),
  validate(z.object({ query: z.object({ branchId: z.coerce.number().int().positive() }) })),
  asyncHandler(async (req: Request, res: Response) => {
    const branchId = resolveBranchId(req, req.query.branchId as string | undefined);
    return ok(res, await diningService.catalog(branchId));
  }),
);

router.post(
  '/dining/tables',
  requirePermissions(PERMISSIONS.DINING_OPERATE),
  validate(z.object({ body: z.object({
    branchId: z.coerce.number().int().positive(),
    code: z.string().trim().min(1).max(30),
    area: z.string().trim().min(2).max(60).default('Salón principal'),
    capacity: z.coerce.number().int().min(1).max(20).default(2),
  }) })),
  asyncHandler(async (req: Request, res: Response) => {
    const table = await diningService.createTable({
      branchId: resolveBranchId(req, req.body.branchId),
      code: req.body.code,
      area: req.body.area,
      capacity: Number(req.body.capacity),
    });
    await audit(req, { action: 'dining.table.create', entity: 'dining_tables', entityId: table.id, after: { code: table.code, branchId: table.branchId } });
    return ok(res, { id: table.id, code: table.code }, 'Mesa creada');
  }),
);

router.post(
  '/dining/commands',
  requirePermissions(PERMISSIONS.DINING_OPERATE),
  validate(z.object({ body: z.object({
    branchId: z.coerce.number().int().positive(),
    idempotencyKey: z.string().min(8).max(80).optional(),
    tableId: z.coerce.number().int().positive(),
    guestName: z.string().trim().max(120).optional().nullable(),
    notes: z.string().trim().max(500).optional().nullable(),
    items: diningItemsSchema,
  }) })),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const command = await diningService.openCommand({
      branchId: resolveBranchId(req, req.body.branchId),
      tableId: Number(req.body.tableId),
      waiterId: req.user.sub,
      guestName: req.body.guestName,
      notes: req.body.notes,
      items: req.body.items,
      idempotencyKey: req.body.idempotencyKey,
    });
    await audit(req, { action: 'dining.command.open', entity: 'orders', entityId: command.orderNumber, after: { branchId: req.body.branchId, tableId: req.body.tableId, total: command.total } });
    return ok(res, command, 'Comanda enviada a cocina');
  }),
);

router.post(
  '/dining/commands/:orderNumber/items',
  requirePermissions(PERMISSIONS.DINING_OPERATE),
  validate(z.object({
    params: z.object({ orderNumber: z.string().min(5).max(20) }),
    body: z.object({ branchId: z.coerce.number().int().positive(), items: diningItemsSchema, idempotencyKey: z.string().min(8).max(80).optional() }),
  })),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const command = await diningService.addItems({
      orderNumber: req.params.orderNumber,
      branchId: resolveBranchId(req, req.body.branchId),
      actorId: req.user.sub,
      items: req.body.items,
      idempotencyKey: req.body.idempotencyKey,
    });
    await audit(req, { action: 'dining.command.items.add', entity: 'orders', entityId: command.orderNumber, after: { branchId: req.body.branchId, total: command.total } });
    return ok(res, command, 'Productos agregados a la comanda');
  }),
);

router.get(
  '/dining/offerings',
  requirePermissions(PERMISSIONS.DINING_READ),
  validate(z.object({ query: z.object({ branchId: z.coerce.number().int().positive() }) })),
  asyncHandler(async (req: Request, res: Response) => ok(res, await diningService.offerings(resolveBranchId(req, req.query.branchId as string | undefined)))),
);

router.post(
  '/dining/offerings',
  requirePermissions(PERMISSIONS.DINING_OPERATE),
  validate(z.object({ body: z.object({
    branchId: z.coerce.number().int().positive(), productId: z.coerce.number().int().positive(), variantId: z.coerce.number().int().positive(),
    name: z.string().trim().min(2).max(120), price: z.coerce.number().positive().max(9999),
    weekdays: z.array(z.coerce.number().int().min(0).max(6)).min(1).max(7),
    startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), endsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    dailyLimit: z.coerce.number().int().positive().max(10000).optional().nullable(),
  }).refine((body) => body.startsAt < body.endsAt, { message: 'La hora final debe ser posterior a la inicial', path: ['endsAt'] }) })),
  asyncHandler(async (req: Request, res: Response) => {
    const offering = await diningService.createOffering({ ...req.body, branchId: resolveBranchId(req, req.body.branchId) });
    await audit(req, { action: 'dining.offering.create', entity: 'dining_offerings', entityId: offering.id, after: offering });
    return ok(res, offering, 'MenÃº programado');
  }),
);

router.patch(
  '/dining/offerings/:offeringId',
  requirePermissions(PERMISSIONS.DINING_OPERATE),
  validate(z.object({
    params: z.object({ offeringId: z.coerce.number().int().positive() }),
    body: z.object({ branchId: z.coerce.number().int().positive(), isActive: z.boolean().optional(), price: z.coerce.number().positive().max(9999).optional(), dailyLimit: z.coerce.number().int().positive().max(10000).optional().nullable(), startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(), endsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional() }),
  })),
  asyncHandler(async (req: Request, res: Response) => ok(res, await diningService.updateOffering({ ...req.body, branchId: resolveBranchId(req, req.body.branchId), offeringId: Number(req.params.offeringId) }), 'MenÃº actualizado')),
);

router.patch(
  '/dining/tables/:tableId/qr',
  requirePermissions(PERMISSIONS.DINING_OPERATE),
  validate(z.object({
    params: z.object({ tableId: z.coerce.number().int().positive() }),
    body: z.object({ branchId: z.coerce.number().int().positive(), enabled: z.boolean().optional(), regenerate: z.boolean().optional() }).refine((body) => body.enabled !== undefined || body.regenerate === true, { message: 'No hay cambios para aplicar' }),
  })),
  asyncHandler(async (req: Request, res: Response) => ok(res, await diningService.setTableQr({ branchId: resolveBranchId(req, req.body.branchId), tableId: Number(req.params.tableId), enabled: req.body.enabled, regenerate: req.body.regenerate }), 'QR de mesa actualizado')),
);

router.post(
  '/dining/commands/:orderNumber/close',
  requirePermissions(PERMISSIONS.DINING_OPERATE),
  validate(z.object({
    params: z.object({ orderNumber: z.string().min(5).max(20) }),
    body: z.object({
      branchId: z.coerce.number().int().positive(),
      payments: z.array(z.object({ method: z.enum(['cash', 'card', 'yape', 'plin']), amount: z.coerce.number().positive().max(99999) })).min(1).max(4),
      documentType: z.enum(['BOLETA', 'FACTURA']).default('BOLETA'),
      billingDocType: z.enum(['DNI', 'RUC', 'CE']).optional().nullable(),
      billingDocNumber: z.string().trim().max(20).optional().nullable(),
      billingName: z.string().trim().max(200).optional().nullable(),
      billingAddress: z.string().trim().max(200).optional().nullable(),
    }),
  })),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const command = await diningService.closeCommand({
      orderNumber: req.params.orderNumber,
      branchId: resolveBranchId(req, req.body.branchId),
      actorId: req.user.sub,
      payments: req.body.payments,
      documentType: req.body.documentType,
      billingDocType: req.body.billingDocType,
      billingDocNumber: req.body.billingDocNumber,
      billingName: req.body.billingName,
      billingAddress: req.body.billingAddress,
    });
    await audit(req, { action: 'dining.command.close', entity: 'orders', entityId: command.orderNumber, after: { branchId: req.body.branchId, payments: req.body.payments, total: command.total } });
    return ok(res, command, 'Mesa cobrada y liberada');
  }),
);

// --- Punto de venta ---
// Comparte el permiso del cajero (`dining.operate`) para que los roles actuales
// puedan empezar a vender sin una migración de usuarios. La venta queda como POS,
// genera ticket de cocina y activa el mismo motor de reservas de inventario.
router.get(
  '/pos/catalog',
  requirePermissions(PERMISSIONS.DINING_OPERATE),
  validate(z.object({ query: z.object({ branchId: z.coerce.number().int().positive() }) })),
  asyncHandler(async (req: Request, res: Response) => ok(res, await diningService.counterCatalog(resolveBranchId(req, req.query.branchId as string | undefined)))),
);

router.post(
  '/pos/sales',
  requirePermissions(PERMISSIONS.DINING_OPERATE),
  validate(z.object({
    body: z.object({
      branchId: z.coerce.number().int().positive(),
      items: diningItemsSchema,
      paymentMethod: z.enum(['cash', 'card', 'yape', 'plin']),
      customerName: z.string().trim().max(120).optional().nullable(),
      notes: z.string().trim().max(500).optional().nullable(),
      idempotencyKey: z.string().trim().min(8).max(80).optional(),
    }),
  })),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const sale = await diningService.createCounterSale({
      ...req.body,
      branchId: resolveBranchId(req, req.body.branchId),
      actorId: req.user.sub,
    });
    await audit(req, { action: 'pos.sale.create', entity: 'orders', entityId: sale.orderNumber, after: { branchId: req.body.branchId, total: sale.total, paymentMethod: req.body.paymentMethod } });
    return ok(res, sale, sale.reused ? 'Venta ya registrada' : 'Venta registrada y enviada a cocina');
  }),
);

// --- Inventario ---
router.get(
  '/inventory',
  requireAnyPermission(PERMISSIONS.INVENTORY_READ, PERMISSIONS.INVENTORY_MANAGE),
  validate(z.object({ query: z.object({ branchId: z.coerce.number().int().positive() }) })),
  operationsController.stock,
);

router.get(
  '/inventory/movements',
  requireAnyPermission(PERMISSIONS.INVENTORY_READ, PERMISSIONS.INVENTORY_MANAGE),
  validate(z.object({ query: z.object({
    branchId: z.coerce.number().int().positive(),
    inventoryItemId: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  }) })),
  asyncHandler(async (req: Request, res: Response) => ok(res, await inventoryService.listMovements(
    resolveBranchId(req, req.query.branchId as string | undefined),
    req.query.inventoryItemId ? Number(req.query.inventoryItemId) : undefined,
    Number(req.query.limit),
  ))),
);

router.get(
  '/inventory/allergens',
  requirePermissions(PERMISSIONS.INVENTORY_MANAGE),
  asyncHandler(async (_req: Request, res: Response) => ok(res, await Allergen.findAll({ attributes: ['code', 'name'], order: [['name', 'ASC']] }))),
);

router.post(
  '/inventory/items',
  requirePermissions(PERMISSIONS.INVENTORY_MANAGE),
  validate(
    z.object({
      body: z.object({
        branchId: z.coerce.number().int().positive(),
        code: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/).optional(),
        itemType: z.enum(['INGREDIENT', 'FINISHED_PRODUCT']).default('INGREDIENT'),
        name: z.string().trim().min(2).max(80),
        unit: z.string().trim().min(1).max(10),
        imageUrl: z.string().trim().max(255).nullable().optional(),
        allergens: z.array(z.string().trim().min(1).max(40)).max(30).nullable().optional(),
        unitCost: inventoryCost.default(0),
        minLevel: inventoryQuantity.default(0),
        initialStock: inventoryQuantity.default(0),
      }),
    }),
  ),
  operationsController.createInventoryItem,
);

router.patch(
  '/inventory/items/:inventoryItemId',
  requirePermissions(PERMISSIONS.INVENTORY_MANAGE),
  validate(z.object({
    params: z.object({ inventoryItemId: z.coerce.number().int().positive() }),
    body: z.object({
      branchId: z.coerce.number().int().positive(),
      itemType: z.enum(['INGREDIENT', 'FINISHED_PRODUCT']).optional(),
      name: z.string().trim().min(2).max(80),
      unit: z.string().trim().min(1).max(10),
      imageUrl: z.string().trim().max(255).nullable().optional(),
      allergens: z.array(z.string().trim().min(1).max(40)).max(30).nullable().optional(),
      unitCost: inventoryCost,
      minLevel: inventoryQuantity,
    }),
  })),
  asyncHandler(async (req: Request, res: Response) => {
    const item = await inventoryService.updateItem({
      branchId: resolveBranchId(req, req.body.branchId),
      inventoryItemId: Number(req.params.inventoryItemId),
      name: req.body.name,
      itemType: req.body.itemType,
      unit: req.body.unit,
      imageUrl: req.body.imageUrl,
      allergens: req.body.allergens,
      unitCost: Number(req.body.unitCost),
      minLevel: Number(req.body.minLevel),
    });
    await audit(req, { action: 'inventory.item.update', entity: 'inventory_items', entityId: String(item.id), after: { name: item.name, unit: item.unit, imageUrl: item.imageUrl, unitCost: Number(item.unitCost), minLevel: Number(item.minLevel) } });
    return ok(res, { id: item.id }, 'Insumo actualizado');
  }),
);

router.delete(
  '/inventory/items/:inventoryItemId',
  requirePermissions(PERMISSIONS.INVENTORY_MANAGE),
  validate(z.object({ params: z.object({ inventoryItemId: z.coerce.number().int().positive() }), query: z.object({ branchId: z.coerce.number().int().positive() }) })),
  asyncHandler(async (req: Request, res: Response) => {
    const item = await inventoryService.archiveItem({ branchId: resolveBranchId(req, req.query.branchId as string), inventoryItemId: Number(req.params.inventoryItemId) });
    await audit(req, { action: 'inventory.item.archive', entity: 'inventory_items', entityId: String(item.id), after: { isActive: false } });
    return ok(res, { id: item.id }, 'Insumo archivado');
  }),
);

router.delete(
  '/inventory/items/:inventoryItemId/permanent',
  requirePermissions(PERMISSIONS.INVENTORY_MANAGE),
  validate(z.object({ params: z.object({ inventoryItemId: z.coerce.number().int().positive() }), query: z.object({ branchId: z.coerce.number().int().positive() }) })),
  asyncHandler(async (req: Request, res: Response) => {
    const item = await inventoryService.deleteArchivedItem({ branchId: resolveBranchId(req, req.query.branchId as string), inventoryItemId: Number(req.params.inventoryItemId) });
    await audit(req, { action: 'inventory.item.delete_permanent', entity: 'inventory_items', entityId: String(item.id), before: { code: item.code, name: item.name, isActive: false } });
    return ok(res, { id: item.id }, 'Insumo eliminado definitivamente');
  }),
);

router.post(
  '/inventory/items/:inventoryItemId/restore',
  requirePermissions(PERMISSIONS.INVENTORY_MANAGE),
  validate(z.object({ params: z.object({ inventoryItemId: z.coerce.number().int().positive() }), body: z.object({ branchId: z.coerce.number().int().positive() }) })),
  asyncHandler(async (req: Request, res: Response) => {
    const item = await inventoryService.restoreItem({ branchId: resolveBranchId(req, req.body.branchId), inventoryItemId: Number(req.params.inventoryItemId) });
    await audit(req, { action: 'inventory.item.restore', entity: 'inventory_items', entityId: String(item.id), after: { isActive: true } });
    return ok(res, { id: item.id }, 'Insumo restaurado');
  }),
);

router.post(
  '/inventory/adjust',
  requirePermissions(PERMISSIONS.INVENTORY_MANAGE),
  validate(
    z.object({
      body: z
        .object({
          branchId: z.coerce.number().int().positive(),
          inventoryItemId: z.coerce.number().int().positive(),
          type: z.enum(['PURCHASE', 'WASTE', 'ADJUSTMENT']),
          /**
           * El AJUSTE es el unico movimiento con signo: negativo cuando el conteo
           * fisico da MENOS que el sistema. Forzarla a positiva aqui era la mitad
           * del defecto, porque dejaba a "Ajuste" sin poder corregir a la baja.
           */
          quantity: z.coerce.number().finite().min(-9_999_999_999.99).max(9_999_999_999.99).refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, 'Usa como máximo dos decimales'),
          expectedOnHand: inventoryQuantity.optional(),
          expectedReserved: inventoryQuantity.optional(),
          reason: z.string().trim().min(3).max(255),
        })
        .refine(
          (body) => (body.type === 'ADJUSTMENT' ? body.quantity !== 0 : body.quantity > 0),
          {
            message: 'La cantidad debe ser positiva; solo el ajuste admite valores negativos',
            path: ['quantity'],
          },
        ),
    }),
  ),
  operationsController.adjustStock,
);

/**
 * Maestro de insumos con la marca de cuales ya se controlan en esta cocina.
 * Sostiene el "Habilitar insumo existente": el insumo es unico para todo el
 * negocio y el stock es por sucursal, asi que sin esta lista un administrador de
 * cocina no podia empezar a controlar lo que otra sucursal ya habia dado de alta.
 */
router.get(
  '/inventory/items',
  requirePermissions(PERMISSIONS.INVENTORY_MANAGE),
  validate(z.object({ query: z.object({ branchId: z.coerce.number().int().positive() }) })),
  asyncHandler(async (req: Request, res: Response) => {
    const branchId = resolveBranchId(req, req.query.branchId as string | undefined);
    return ok(res, await inventoryService.listMasterItems(branchId));
  }),
);

router.post(
  '/inventory/items/enable',
  requirePermissions(PERMISSIONS.INVENTORY_MANAGE),
  validate(
    z.object({
      body: z.object({
        branchId: z.coerce.number().int().positive(),
        inventoryItemId: z.coerce.number().int().positive(),
        initialStock: inventoryQuantity.default(0),
      }),
    }),
  ),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();

    const { stock, item, created } = await inventoryService.enableItem({
      branchId: resolveBranchId(req, req.body.branchId),
      inventoryItemId: Number(req.body.inventoryItemId),
      initialStock: Number(req.body.initialStock),
      actorId: req.user.sub,
    });

    return ok(
      res,
      { inventoryItemId: stock.inventoryItemId, onHand: Number(stock.onHand) },
      created
        ? `${item.name} habilitado en esta cocina`
        : `${item.name} ya se controlaba en esta cocina`,
    );
  }),
);

// --- Compras, proveedores y lotes ---
const purchaseQuantity = z.coerce.number().finite().positive().refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, 'Usa hasta 2 decimales');
const purchaseCost = z.coerce.number().finite().min(0).refine((value) => Math.abs(value * 10_000 - Math.round(value * 10_000)) < 1e-6, 'Usa hasta 4 decimales');
const purchaseAmount = z.coerce.number().finite().min(0).refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, 'Usa hasta 2 decimales');
router.get(
  '/procurement/items',
  requireAnyPermission(PERMISSIONS.PROCUREMENT_READ, PERMISSIONS.PROCUREMENT_MANAGE),
  validate(z.object({ query: z.object({ branchId: z.coerce.number().int().positive() }) })),
  asyncHandler(async (req: Request, res: Response) => {
    const branchId = resolveBranchId(req, req.query.branchId as string);
    const stock = await inventoryService.listStock(branchId);
    return ok(res, stock.map((row) => ({
      id: row.inventoryItemId,
      code: row.code,
      name: row.name,
      unit: row.unit,
      unitCost: row.unitCost,
    })));
  }),
);
router.get(
  '/procurement/suppliers',
  requireAnyPermission(PERMISSIONS.PROCUREMENT_READ, PERMISSIONS.PROCUREMENT_MANAGE),
  validate(z.object({ query: z.object({ includeInactive: z.enum(['true', 'false']).optional() }).default({}) })),
  asyncHandler(async (req: Request, res: Response) => ok(res, await procurementService.listSuppliers(req.query.includeInactive === 'true'))),
);

router.post(
  '/procurement/suppliers',
  requirePermissions(PERMISSIONS.PROCUREMENT_MANAGE),
  validate(z.object({ body: z.object({
    code: z.string().trim().min(2).max(40).optional(), name: z.string().trim().min(2).max(120),
    taxId: z.string().trim().max(20).optional().nullable(), contactName: z.string().trim().max(120).optional().nullable(),
    email: z.preprocess((value) => value === '' ? undefined : value, z.string().email().max(160).optional().nullable()), phone: z.string().trim().max(30).optional().nullable(),
    address: z.string().trim().max(255).optional().nullable(), paymentTermsDays: z.coerce.number().int().min(0).max(365).optional(), notes: z.string().trim().max(2_000).optional().nullable(),
  }) })),
  asyncHandler(async (req: Request, res: Response) => {
    const supplier = await procurementService.createSupplier(req.body);
    await audit(req, { action: 'procurement.supplier.create', entity: 'suppliers', entityId: supplier.id, after: { code: supplier.code, name: supplier.name } });
    return ok(res, supplier, 'Proveedor creado');
  }),
);

router.patch(
  '/procurement/suppliers/:supplierId',
  requirePermissions(PERMISSIONS.PROCUREMENT_MANAGE),
  validate(z.object({ params: z.object({ supplierId: z.coerce.number().int().positive() }), body: z.object({
    code: z.string().trim().min(2).max(40).optional(), name: z.string().trim().min(2).max(120).optional(),
    taxId: z.string().trim().max(20).optional().nullable(), contactName: z.string().trim().max(120).optional().nullable(),
    email: z.preprocess((value) => value === '' ? undefined : value, z.string().email().max(160).optional().nullable()), phone: z.string().trim().max(30).optional().nullable(), address: z.string().trim().max(255).optional().nullable(),
    paymentTermsDays: z.coerce.number().int().min(0).max(365).optional(), notes: z.string().trim().max(2_000).optional().nullable(), isActive: z.boolean().optional(),
  }) })),
  asyncHandler(async (req: Request, res: Response) => {
    const supplier = await procurementService.updateSupplier(Number(req.params.supplierId), req.body);
    await audit(req, { action: 'procurement.supplier.update', entity: 'suppliers', entityId: supplier.id, after: { code: supplier.code, name: supplier.name, isActive: supplier.isActive } });
    return ok(res, supplier, 'Proveedor actualizado');
  }),
);

router.get(
  '/procurement/purchase-orders',
  requireAnyPermission(PERMISSIONS.PROCUREMENT_READ, PERMISSIONS.PROCUREMENT_MANAGE),
  validate(z.object({ query: z.object({ branchId: z.coerce.number().int().positive(), status: z.string().optional() }) })),
  asyncHandler(async (req: Request, res: Response) => ok(res, await procurementService.listPurchaseOrders(resolveBranchId(req, req.query.branchId as string | undefined), req.query.status as string | undefined))),
);

router.get(
  '/procurement/purchase-orders/:orderId',
  requireAnyPermission(PERMISSIONS.PROCUREMENT_READ, PERMISSIONS.PROCUREMENT_MANAGE),
  validate(z.object({ params: z.object({ orderId: z.coerce.number().int().positive() }), query: z.object({ branchId: z.coerce.number().int().positive() }) })),
  asyncHandler(async (req: Request, res: Response) => ok(res, await procurementService.getPurchaseOrder(Number(req.params.orderId), resolveBranchId(req, req.query.branchId as string | undefined)))),
);

router.post(
  '/procurement/purchase-orders',
  requirePermissions(PERMISSIONS.PROCUREMENT_MANAGE),
  validate(z.object({ body: z.object({
    branchId: z.coerce.number().int().positive(), supplierId: z.coerce.number().int().positive(), expectedAt: z.string().date().optional().nullable(),
    notes: z.string().trim().max(2_000).optional().nullable(), tax: purchaseAmount.optional(),
    items: z.array(z.object({ inventoryItemId: z.coerce.number().int().positive(), quantity: purchaseQuantity, unitCost: purchaseCost, notes: z.string().trim().max(255).optional().nullable() })).min(1).max(100),
  }) })),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const order = await procurementService.createPurchaseOrder({ ...req.body, branchId: resolveBranchId(req, req.body.branchId), actorId: req.user.sub });
    await audit(req, { action: 'procurement.purchase_order.create', entity: 'purchase_orders', entityId: order.id, after: { orderNumber: order.orderNumber, total: order.total } });
    return ok(res, order, 'Orden de compra creada');
  }),
);

router.patch(
  '/procurement/purchase-orders/:orderId',
  requirePermissions(PERMISSIONS.PROCUREMENT_MANAGE),
  validate(z.object({
    params: z.object({ orderId: z.coerce.number().int().positive() }),
    body: z.object({
      branchId: z.coerce.number().int().positive(), supplierId: z.coerce.number().int().positive(),
      expectedAt: z.string().date().optional().nullable(), notes: z.string().trim().max(2_000).optional().nullable(), tax: purchaseAmount.optional(),
      items: z.array(z.object({ inventoryItemId: z.coerce.number().int().positive(), quantity: purchaseQuantity, unitCost: purchaseCost, notes: z.string().trim().max(255).optional().nullable() })).min(1).max(100),
    }),
  })),
  asyncHandler(async (req: Request, res: Response) => {
    const order = await procurementService.updatePurchaseOrder({ ...req.body, orderId: Number(req.params.orderId), branchId: resolveBranchId(req, req.body.branchId) });
    await audit(req, { action: 'procurement.purchase_order.update', entity: 'purchase_orders', entityId: order.id, after: { orderNumber: order.orderNumber, total: order.total, supplierId: order.supplierId } });
    return ok(res, order, 'Orden de compra actualizada');
  }),
);

router.post(
  '/procurement/purchase-orders/:orderId/receive',
  requirePermissions(PERMISSIONS.PROCUREMENT_MANAGE),
  validate(z.object({ params: z.object({ orderId: z.coerce.number().int().positive() }), body: z.object({
    branchId: z.coerce.number().int().positive(), lines: z.array(z.object({ purchaseOrderItemId: z.coerce.number().int().positive(), quantity: purchaseQuantity, lotCode: z.string().trim().min(1).max(80), expiresAt: z.string().date().optional().nullable(), unitCost: purchaseCost.optional() })).min(1).max(100),
  }) })),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const order = await procurementService.receivePurchaseOrder({ ...req.body, orderId: Number(req.params.orderId), branchId: resolveBranchId(req, req.body.branchId), actorId: req.user.sub });
    await audit(req, { action: 'procurement.purchase_order.receive', entity: 'purchase_orders', entityId: order.id, after: { status: order.status, receivedAt: order.receivedAt } });
    return ok(res, order, 'Recepción registrada y stock actualizado');
  }),
);

router.post(
  '/procurement/purchase-orders/:orderId/cancel',
  requirePermissions(PERMISSIONS.PROCUREMENT_MANAGE),
  validate(z.object({ params: z.object({ orderId: z.coerce.number().int().positive() }), body: z.object({ branchId: z.coerce.number().int().positive(), reason: z.string().trim().min(4).max(500) }) })),
  asyncHandler(async (req: Request, res: Response) => {
    const order = await procurementService.cancelPurchaseOrder({ orderId: Number(req.params.orderId), branchId: resolveBranchId(req, req.body.branchId), reason: req.body.reason });
    await audit(req, { action: 'procurement.purchase_order.cancel', entity: 'purchase_orders', entityId: order.id, after: { status: order.status, reason: req.body.reason } });
    return ok(res, order, 'Saldo pendiente cancelado');
  }),
);

router.get(
  '/procurement/lots',
  requireAnyPermission(PERMISSIONS.PROCUREMENT_READ, PERMISSIONS.PROCUREMENT_MANAGE),
  validate(z.object({ query: z.object({ branchId: z.coerce.number().int().positive(), status: z.string().optional() }) })),
  asyncHandler(async (req: Request, res: Response) => ok(res, await procurementService.listLots(resolveBranchId(req, req.query.branchId as string | undefined), req.query.status as string | undefined))),
);

router.get(
  '/procurement/cost-summary',
  requireAnyPermission(PERMISSIONS.PROCUREMENT_READ, PERMISSIONS.PROCUREMENT_MANAGE),
  validate(z.object({ query: z.object({ branchId: z.coerce.number().int().positive(), from: z.string().date().optional(), to: z.string().date().optional() }) })),
  asyncHandler(async (req: Request, res: Response) => ok(res, await procurementService.costSummary(resolveBranchId(req, req.query.branchId as string | undefined), req.query.from as string | undefined, req.query.to as string | undefined))),
);

export default router;
