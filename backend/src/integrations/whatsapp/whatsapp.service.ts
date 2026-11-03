import { CakeDesignRequest, Order, Payment, User } from '@database/models';
import { ORDER_STATUS, type OrderStatus } from '@config/constants';
import { env } from '@config/env';
import { settingsService } from '@modules/settings/settings.service';
import { whatsappRecipient } from '@shared/utils/whatsappPhone';
import { communicationQueue } from '@modules/communications/communications.queue';
import type { CommunicationEvent } from '@modules/communications/communications.config';
import { orderWhatsappText } from '@modules/communications/orderCommunications.logic';

export const whatsappService = {
  async notifyOrder(orderId: number, status: OrderStatus) {
    const events: Partial<Record<OrderStatus, CommunicationEvent>> = {
      [ORDER_STATUS.PENDING_PAYMENT]: 'ORDER_RECEIVED',
      [ORDER_STATUS.CONFIRMED]: 'ORDER_CONFIRMED', [ORDER_STATUS.PREPARING]: 'ORDER_PREPARING',
      [ORDER_STATUS.READY]: 'ORDER_READY', [ORDER_STATUS.OUT_FOR_DELIVERY]: 'ORDER_OUT_FOR_DELIVERY',
      [ORDER_STATUS.DELIVERED]: 'ORDER_DELIVERED', [ORDER_STATUS.CANCELLED]: 'ORDER_CANCELLED',
    };
    const event = events[status];
    if (!event) return;
    const settings = await settingsService.getCommunicationSettings();
    if (!settings.orderUpdatesEnabled) return;
    const order = await Order.findByPk(orderId);
    if (status === ORDER_STATUS.PENDING_PAYMENT) {
      const payment = await Payment.findOne({ where: { payableType: 'ORDER', payableId: orderId }, order: [['id', 'DESC']] });
      if (payment && ['yape', 'plin'].includes(payment.provider)) return;
    }
    if (!order?.whatsappOptInAt || !order.userId) return;
    const user = await User.findByPk(order.userId);
    const recipient = whatsappRecipient(user?.phone);
    if (!recipient) return;
    await communicationQueue.enqueue({ channel: 'WHATSAPP', recipient, userId: order.userId, orderId, event,
      subject: `Pedido ${order.orderNumber}: ${status}`, key: `wa:order:${order.id}:${status}`,
      payload: { kind: 'template', parameters: [order.orderNumber, new URL(`/cuenta/pedidos/${encodeURIComponent(order.orderNumber)}`, env.FRONTEND_URL).toString()], text: orderWhatsappText(order.orderNumber, status, new URL(`/cuenta/pedidos/${encodeURIComponent(order.orderNumber)}`, env.FRONTEND_URL).toString()) } });
  },
  async notifyDesignQuote(requestId: number, quoteId: number) {
    const request = await CakeDesignRequest.findByPk(requestId);
    if (!request?.whatsappOptInAt) return;
    const user = await User.findByPk(request.userId);
    const recipient = whatsappRecipient(user?.phone);
    if (!recipient) return;
    await communicationQueue.enqueue({ channel: 'WHATSAPP', recipient, userId: request.userId, event: 'DESIGN_QUOTED',
      subject: `Cotización del diseño #${request.id}`, key: `wa:design:${request.id}:quote:${quoteId}`,
      payload: { kind: 'template', parameters: [`#${request.id}`, new URL(`/cuenta/disenos?solicitud=${request.id}`, env.FRONTEND_URL).toString()], designRequestId: request.id } });
  },
};
