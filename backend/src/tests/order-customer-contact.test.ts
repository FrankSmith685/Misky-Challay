import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import type { Transaction } from 'sequelize';
import { AppEvent, Order, User, sequelize } from '@database/models';
import { TEMPLATES } from '../modules/notifications/templates';
import { activityIsCurrent } from '../modules/notifications/activity.service';
import { orderContactService } from '../modules/admin/orderContact.service';
import { orderCommunicationIsRelevant, orderWhatsappText } from '../modules/communications/orderCommunications.logic';
import { whatsappService } from '../integrations/whatsapp/whatsapp.service';
import { communicationQueue } from '../modules/communications/communications.queue';
import { settingsService } from '../modules/settings/settings.service';

afterEach(() => mock.restoreAll());
const transaction = { LOCK: { UPDATE: 'UPDATE' } } as Transaction;
const data = { orderNumber: 'CONTACT-1', customerName: 'Ana', grandTotal: 100, items: [], scheduledAt: '2026-11-10T17:00:00Z', supportEmail: 'support@example.test' };

test('recibir el pedido inicia la coordinación sin afirmar que el pago o la preparación están confirmados', () => {
  const message = TEMPLATES.ORDER_RECEIVED(data);
  assert.match(message.text, /pago está pendiente/);
  assert.match(message.text, /preparación aún no está confirmada/);
  assert.match(message.text, /diseño, las imágenes de referencia/);
  assert.doesNotMatch(message.text, /Gracias por confiar/);
});

test('confirmar informa cómo coordinar el pedido y entregar es el momento del agradecimiento', () => {
  const confirmed = TEMPLATES.ORDER_CONFIRMED(data);
  const delivered = TEMPLATES.ORDER_DELIVERED(data);
  assert.match(confirmed.text, /Coordinemos contigo/);
  assert.match(confirmed.text, /support@example.test/);
  assert.doesNotMatch(confirmed.text, /Gracias por confiar/);
  assert.match(delivered.text, /fue entregado.*Gracias por confiar/);
  assert.match(delivered.html, /Gracias por confiar en nosotros/);
});

test('el texto de WhatsApp separa coordinación inicial de agradecimiento final', () => {
  for (const status of ['PENDING_PAYMENT', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY']) assert.doesNotMatch(orderWhatsappText('CONTACT-1', status, 'https://example.test/order'), /Gracias por confiar/);
  assert.match(orderWhatsappText('CONTACT-1', 'CONFIRMED', 'https://example.test/order'), /coordinar el diseño/);
  assert.match(orderWhatsappText('CONTACT-1', 'DELIVERED', 'https://example.test/order'), /fue entregado.*Gracias por confiar/);
});

test('el aviso inicial confirmado sigue siendo pertinente al avanzar preparación y se omite al cerrar el pedido', () => {
  for (const status of ['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY']) assert.equal(orderCommunicationIsRelevant('ORDER_CONFIRMED', status), true);
  for (const status of ['DELIVERED', 'CANCELLED', 'REFUNDED', 'PENDING_PAYMENT']) assert.equal(orderCommunicationIsRelevant('ORDER_CONFIRMED', status), false);
  assert.equal(orderCommunicationIsRelevant('ORDER_RECEIVED', 'PENDING_PAYMENT'), true);
  assert.equal(orderCommunicationIsRelevant('ORDER_RECEIVED', 'CONFIRMED'), false);
  assert.equal(orderCommunicationIsRelevant('ORDER_DELIVERED', 'OUT_FOR_DELIVERY'), false);
  assert.equal(orderCommunicationIsRelevant('ORDER_DELIVERED', 'DELIVERED'), true);
});

test('el evento duradero de confirmación no desaparece al comenzar cocina', async () => {
  const order = Order.build({ id: 1, orderNumber: 'CONTACT-1', branchId: 2, deliveryType: 'PICKUP', subtotal: 100, grandTotal: 100, status: 'PREPARING' });
  mock.method(Order, 'findByPk', async () => order);
  const event = AppEvent.build({ topic: 'orders', model: 'Order', entityId: 1, payload: { status: 'CONFIRMED' } });
  assert.equal(await activityIsCurrent(event), true);
  order.status = 'DELIVERED';
  assert.equal(await activityIsCurrent(event), false);
});

test('WhatsApp coloca el aviso correcto en cola con consentimiento, sin enviar por la red', async () => {
  mock.method(settingsService, 'getCommunicationSettings', async () => ({ orderUpdatesEnabled: true }));
  mock.method(Order, 'findByPk', async () => ({ id: 1, userId: 7, orderNumber: 'CONTACT-1', whatsappOptInAt: new Date() }));
  mock.method(User, 'findByPk', async () => ({ id: 7, phone: '999888777' }));
  const enqueue = mock.method(communicationQueue, 'enqueue', async () => undefined);
  await whatsappService.notifyOrder(1, 'CONFIRMED');
  await whatsappService.notifyOrder(1, 'DELIVERED');
  const initial = enqueue.mock.calls[0].arguments[0];
  const completed = enqueue.mock.calls[1].arguments[0];
  assert.ok(initial); assert.ok(completed);
  assert.equal(initial.event, 'ORDER_CONFIRMED');
  assert.doesNotMatch(String(initial.payload.text), /Gracias por confiar/);
  assert.equal(completed.event, 'ORDER_DELIVERED');
  assert.match(String(completed.payload.text), /Gracias por confiar/);
});

test('el contacto se registra explícitamente una sola vez, con fecha del servidor y alcance de sucursal', async () => {
  const order = Order.build({ id: 1, orderNumber: 'CONTACT-1', branchId: 2, deliveryType: 'PICKUP', subtotal: 100, grandTotal: 100 });
  mock.method(Order, 'findOne', async () => order);
  mock.method(sequelize, 'transaction', async (callback: (tx: Transaction) => unknown) => callback(transaction));
  const update = mock.method(order, 'update', async (values: object) => { order.set(values); return order; });
  let scope = 0;
  const started = Date.now();
  const first = await orderContactService.record('CONTACT-1', { channel: 'WHATSAPP', note: 'Acordamos flores azules' }, 9, (branch) => { scope = branch; });
  assert.equal(scope, 2);
  assert.equal(first.record.actorId, 9);
  assert.ok(Date.parse(first.record.contactedAt) >= started);
  const repeated = await orderContactService.record('CONTACT-1', { channel: 'EMAIL', note: 'Reintento' }, 10, () => undefined);
  assert.equal(repeated.reused, true);
  assert.equal(repeated.record.actorId, 9);
  assert.equal(update.mock.callCount(), 1);
});

test('personal de otra sucursal no puede marcar un contacto como realizado', async () => {
  const order = Order.build({ id: 1, orderNumber: 'CONTACT-1', branchId: 2, deliveryType: 'PICKUP', subtotal: 100, grandTotal: 100 });
  mock.method(Order, 'findOne', async () => order);
  mock.method(sequelize, 'transaction', async (callback: (tx: Transaction) => unknown) => callback(transaction));
  const update = mock.method(order, 'update', async () => order);
  await assert.rejects(orderContactService.record('CONTACT-1', { channel: 'PHONE', note: '' }, 9, () => { throw new Error('Sin acceso a esta sucursal'); }), /Sin acceso/);
  assert.equal(update.mock.callCount(), 0);
});
