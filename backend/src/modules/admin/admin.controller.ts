import type { Request, Response } from 'express';
import { ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { ApiError } from '@shared/errors/ApiError';
import { audit } from '@shared/utils/audit';
import { assertBranchScope, branchScopeCheck } from '@shared/utils/scope';
import { Order } from '@database/models';
import { ORDER_STATUS, PERMISSIONS, type OrderStatus, type PermissionCode } from '@config/constants';
import { ordersService } from '@modules/orders/orders.service';
import { inventoryService } from '@modules/operations/inventory.service';
import { cancelTicketForOrder } from '@modules/operations/operations.service';
import { abortForOrder } from '@modules/delivery/delivery.service';
import { paymentsService } from '@modules/payments/payments.service';
import { sequelize } from '@database/models';
import { adminService, type OrderBoardFilters } from './admin.service';

/**
 * Permiso EXTRA que no se puede exigir en la ruta porque depende del cuerpo de la
 * peticion (el destino del cambio de estado) o porque decide que se devuelve, no
 * si se deja pasar. El superadmin se salta la comprobacion igual que en el
 * middleware: es una marca del sistema, no un rol con todos los permisos.
 */
const has = (req: Request, permission: PermissionCode): boolean =>
  Boolean(req.user?.isSuperAdmin) || (req.user?.permissions ?? []).includes(permission);

/** Modulo ADMIN (M13): tablero, reportes y auditoria. */
export const adminController = {
  orders: asyncHandler(async (req: Request, res: Response) => {
    const filters = req.query as unknown as OrderBoardFilters;

    // Un admin de sucursal solo ve SUS pedidos, aunque cambie el branchId en la URL.
    const scope = req.user?.branchIds ?? [];
    if (!req.user?.isSuperAdmin && scope.length > 0) {
      filters.branchId = assertBranchScope(req, Number(filters.branchId ?? scope[0]));
    }

    const { orders, meta } = await adminService.orderBoard(filters);
    return ok(res, orders, `${meta.total} pedidos`, meta);
  }),

  /** Ficha completa del pedido: lineas, personalizaciones, historial y pago. */
  orderDetail: asyncHandler(async (req: Request, res: Response) => {
    const detail = await adminService.orderDetail(req.params.orderNumber, {
      // Unico sitio del backend donde `payment.read` se ejerce de verdad. Quien no
      // lo tiene recibe la ficha sin el bloque de dinero, no una ficha censurada
      // en el navegador.
      includePayments: has(req, PERMISSIONS.PAYMENT_READ) || has(req, PERMISSIONS.PAYMENT_REFUND),
      scopeCheck: branchScopeCheck(req),
    });

    return ok(res, detail);
  }),

  /** Registra un CPE ya aceptado por el proveedor; no simula una emision SUNAT. */
  registerInvoice: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const order = await adminService.registerInvoice(
      req.params.orderNumber,
      req.body,
      branchScopeCheck(req),
    );
    await audit(req, {
      action: 'invoice.register',
      entity: 'orders',
      entityId: order.id,
      after: {
        invoiceStatus: order.invoiceStatus,
        invoiceSeries: order.invoiceSeries,
        invoiceNumber: order.invoiceNumber,
        invoiceProviderReference: order.invoiceProviderReference,
      },
    });
    return ok(res, {
      orderNumber: order.orderNumber,
      invoiceStatus: order.invoiceStatus,
      invoiceSeries: order.invoiceSeries,
      invoiceNumber: order.invoiceNumber,
      invoiceIssuedAt: order.invoiceIssuedAt,
    }, 'Comprobante emitido registrado');
  }),

  recordInternalReceiptPrint: asyncHandler(async (req: Request, res: Response) => {
    const order = await adminService.recordInternalReceiptPrint(
      req.params.orderNumber,
      branchScopeCheck(req),
    );
    await audit(req, {
      action: 'internal_receipt.print',
      entity: 'orders',
      entityId: order.id,
      after: {
        orderNumber: order.orderNumber,
        printCount: order.internalReceiptPrintCount,
        lastPrintedAt: order.internalReceiptLastPrintedAt,
      },
    });
    return ok(res, {
      orderNumber: order.orderNumber,
      printCount: order.internalReceiptPrintCount,
      firstPrintedAt: order.internalReceiptFirstPrintedAt,
      lastPrintedAt: order.internalReceiptLastPrintedAt,
    }, order.internalReceiptPrintCount > 1 ? 'Reimpresion registrada' : 'Impresion registrada');
  }),

  /**
   * Cambio de estado desde el panel (soporte / administrador), auditado.
   *
   * Tres defectos graves vivian aqui:
   *
   * 1. REEMBOLSO SIN PERMISO. Al llegar a CANCELLED se llamaba a
   *    `refundOrderPayment`, que devuelve dinero de verdad contra el proveedor, y
   *    la ruta solo exigia `order.update_status`. Un administrador de sucursal, a
   *    quien deliberadamente no se le dio `payment.refund`, reembolsaba con un
   *    boton de operacion. Ahora el reembolso automatico solo se intenta si el
   *    actor puede reembolsar; si no, la respuesta lo dice y el cobro queda para
   *    quien si tiene el permiso.
   * 2. `order.cancel` NO SE COMPROBABA EN NINGUN ENDPOINT. Se exige aqui, que es
   *    donde se cancela.
   * 3. CANCELAR DOS VECES SOBREVENDIA LA FRANJA. El pedido se leia sin bloqueo y
   *    `changeStatus` salia en silencio si el estado ya era el destino, pero
   *    `releaseReservations` ya habia corrido y descontaba un cupo AJENO. El
   *    pedido se relee DENTRO de la transaccion con `LOCK.UPDATE` y repetir el
   *    mismo estado devuelve 409.
   */
  updateOrderStatus: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();

    const next = req.body.status as OrderStatus;
    const reason: string = req.body.comment ?? 'Cancelado por soporte';

    if (next !== ORDER_STATUS.CANCELLED) {
      throw ApiError.unprocessable(
        'El avance operativo se registra desde Cocina, Reparto o Salon. Pedidos solo gestiona incidencias y cancelaciones.',
      );
    }

    // Lectura previa solo para responder 404/403 antes de abrir transaccion.
    const preview = await Order.findOne({
      where: { orderNumber: req.params.orderNumber },
      attributes: ['id', 'branchId'],
    });
    if (!preview) throw ApiError.notFound('Pedido no encontrado');
    // El permiso dice QUE puede hacer; esto, SOBRE QUE pedido.
    assertBranchScope(req, preview.branchId);

    if (next === ORDER_STATUS.CANCELLED && !has(req, PERMISSIONS.ORDER_CANCEL)) {
      throw ApiError.forbidden('No tienes permiso para cancelar pedidos');
    }

    const canRefund = has(req, PERMISSIONS.PAYMENT_REFUND);

    const { order, before } = await sequelize.transaction(async (transaction) => {
      const locked = await Order.findByPk(preview.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!locked) throw ApiError.notFound('Pedido no encontrado');

      const before = { status: locked.status };

      if (locked.status === next) {
        throw ApiError.conflict(`El pedido ya estaba en ${next}`);
      }

      if (next === ORDER_STATUS.CANCELLED) {
        locked.cancelReason = reason;
        // El orden importa: `releaseReservations` mira el estado ACTUAL para saber
        // de que contador de la franja descontar. Va antes de `changeStatus`.
        await ordersService.releaseReservations(locked, transaction);
        await inventoryService.releaseForOrder(locked, transaction);
        // Cancelar dejaba VIVOS el ticket de cocina y el reparto: la cocina seguia
        // cocinando un pedido muerto y el despachador le asignaba repartidor.
        // Ambos contratos son idempotentes y liberan al repartidor.
        await cancelTicketForOrder(locked.id, reason, transaction);
        await abortForOrder(locked.id, reason, transaction);
      }

      await ordersService.changeStatus(locked, next, {
        actorId: req.user?.sub ?? null,
        source: 'STAFF',
        comment: req.body.comment ?? null,
        transaction,
      });

      return { order: locked, before };
    });

    // Fuera de la transaccion: llamada de red al proveedor. Si falla, queda
    // registrado y el pedido sigue cancelado (el reembolso se retoma a mano).
    const refundable =
      next === ORDER_STATUS.CANCELLED ? await paymentsService.refundableForOrder(order) : null;
    const refund =
      refundable && canRefund
        ? await paymentsService.refundOrderPayment(order, reason, req.user.sub)
        : null;

    await audit(req, {
      action: 'order.update_status',
      entity: 'orders',
      entityId: order.id,
      before,
      after: {
        status: order.status,
        comment: req.body.comment ?? null,
        refundId: refund?.id ?? null,
        // Deja rastro de que quedo dinero sin devolver y por que.
        refundPending: Boolean(refundable) && refund === null,
      },
    });

    let message = 'Estado actualizado';
    if (refundable && !canRefund) {
      // `Number(...)`: mysql2 entrega los DECIMAL como cadena y `.toFixed` reventaria.
      message = `Estado actualizado. Queda un cobro de S/ ${Number(refundable.amount).toFixed(2)} sin devolver: pideselo a alguien con permiso de reembolsos.`;
    } else if (refundable && !refund) {
      message =
        'Estado actualizado, pero el reembolso automatico no salio. Devuelvelo a mano desde la ficha del pedido.';
    } else if (refund) {
      message = 'Estado actualizado y cobro devuelto al cliente.';
    }

    return ok(
      res,
      {
        orderNumber: order.orderNumber,
        status: order.status,
        refunded: refund !== null,
        refundPending: Boolean(refundable) && refund === null,
      },
      message,
    );
  }),

  reports: asyncHandler(async (req: Request, res: Response) => {
    const scope = req.user?.branchIds ?? [];
    const requested = req.query.branchId ? Number(req.query.branchId) : undefined;

    const reports = await adminService.reports({
      branchId:
        !req.user?.isSuperAdmin && scope.length > 0
          ? assertBranchScope(req, requested ?? scope[0])
          : requested,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      // La ruta se abrio a `report.operations.read`; el bloque de dinero sigue
      // necesitando `report.sales.read`.
      includeSales: has(req, PERMISSIONS.REPORT_SALES_READ),
    });
    return ok(res, reports);
  }),

  auditLogs: asyncHandler(async (req: Request, res: Response) => {
    const { logs, meta } = await adminService.auditLogs(req.query);
    return ok(res, logs, `${meta.total} registros`, meta);
  }),
};
