import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from 'sequelize';
import { sequelize } from '../connection';
import {
  BILLING_DOC_TYPE,
  CURRENCY,
  DELIVERY_TYPE,
  DOCUMENT_TYPE,
  INVOICE_STATUS,
  ORDER_STATUS,
  ORDER_SOURCE,
  SERVICE_MODE,
  type BillingDocType,
  type DeliveryType,
  type DocumentType,
  type InvoiceStatus,
  type OrderStatus,
  type OrderSource,
  type ServiceMode,
} from '@config/constants';
import type { OrderItem } from './orderItem.model';
import type { OrderTermsAcceptance } from '../../modules/settings/checkoutTerms.service';
import type { CustomerContactRecord } from '../../modules/admin/orderContact.service';

export interface AddressSnapshot {
  label: string;
  line1: string;
  reference?: string | null;
  districtId?: number | null;
  districtName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Tabla `orders` (seccion 14.4): la entidad principal de venta.
 *
 * Nada de esto se recalcula despues: los importes y la direccion quedan
 * congelados (RN-017). El estado solo pasa a CONFIRMED por un evento confiable
 * del proveedor de pago (RN-014).
 */
export class Order extends Model<InferAttributes<Order>, InferCreationAttributes<Order>> {
  declare id: CreationOptional<number>;
  declare orderNumber: string;
  declare userId: number | null;
  declare branchId: number;
  declare diningTableId: CreationOptional<number | null>;
  declare waiterId: CreationOptional<number | null>;
  declare source: CreationOptional<OrderSource>;
  declare coverageZoneId: CreationOptional<number | null>;
  declare deliveryType: DeliveryType;
  declare serviceMode: CreationOptional<ServiceMode>;
  declare deliverySlotId: CreationOptional<number | null>;
  declare scheduledAt: CreationOptional<Date | null>;
  declare status: CreationOptional<OrderStatus>;

  declare addressSnapshotJson: CreationOptional<AddressSnapshot | null>;
  declare contactName: CreationOptional<string | null>;
  declare contactPhone: CreationOptional<string | null>;
  declare whatsappOptInAt: CreationOptional<Date | null>;
  declare termsAcceptanceJson: CreationOptional<OrderTermsAcceptance | null>;
  declare giftJson: CreationOptional<{ recipientName: string; recipientPhone?: string; hidePrices: boolean; message?: string; token: string } | null>;
  declare customerContactJson: CreationOptional<CustomerContactRecord | null>;

  declare subtotal: number;
  declare deliveryFee: CreationOptional<number>;
  /** Parte del delivery correspondiente al manejo especial de tortas. */
  declare cakeDeliveryFee: CreationOptional<number>;
  declare deliveryVehicleType: CreationOptional<'CAR' | null>;
  declare deliveryHandlingInstructions: CreationOptional<string | null>;
  declare discountTotal: CreationOptional<number>;
  declare walletAmount: CreationOptional<number>;
  /** Tasa de IGV vigente al cerrar el pedido. Congelada: si la tasa cambia, el
   *  historico sigue explicando el importe con la que se le aplico. */
  declare taxRate: CreationOptional<number>;
  /** Valor de venta (lo cobrado menos el IGV que lleva dentro). */
  declare taxableBase: CreationOptional<number>;
  /** IGV contenido en el importe cobrado. NO se suma al total. */
  declare taxTotal: CreationOptional<number>;
  declare grandTotal: number;
  /** Plan de cobro para tortas de diseño: anticipo y saldo separado. */
  declare paymentPlan: CreationOptional<'FULL' | 'DEPOSIT_BALANCE'>;
  declare depositAmount: CreationOptional<number>;
  declare balanceAmount: CreationOptional<number>;
  declare balanceDueAt: CreationOptional<Date | null>;
  declare depositPaidAt: CreationOptional<Date | null>;
  declare balancePaidAt: CreationOptional<Date | null>;
  declare currency: CreationOptional<string>;

  // --- Comprobante de pago (SUNAT) ---
  /** BOLETA (por defecto) o FACTURA. */
  declare documentType: CreationOptional<DocumentType>;
  /** Documento del receptor: DNI/CE en boleta, RUC en factura. */
  declare billingDocType: CreationOptional<BillingDocType | null>;
  declare billingDocNumber: CreationOptional<string | null>;
  /** Nombre del receptor o razon social (factura). */
  declare billingName: CreationOptional<string | null>;
  /** Domicilio fiscal (solo factura). */
  declare billingAddress: CreationOptional<string | null>;
  /** Estado de emision ante el OSE. Nace PENDING hasta que exista OSE configurado. */
  declare invoiceStatus: CreationOptional<InvoiceStatus>;
  /** Identificadores devueltos por el proveedor de comprobantes/SUNAT. */
  declare invoiceSeries: CreationOptional<string | null>;
  declare invoiceNumber: CreationOptional<string | null>;
  declare invoiceIssuedAt: CreationOptional<Date | null>;
  declare invoiceProviderReference: CreationOptional<string | null>;
  declare invoicePdfUrl: CreationOptional<string | null>;
  declare invoiceXmlUrl: CreationOptional<string | null>;

  // --- Ticket interno (documento operativo, no fiscal) ---
  declare internalReceiptFirstPrintedAt: CreationOptional<Date | null>;
  declare internalReceiptLastPrintedAt: CreationOptional<Date | null>;
  declare internalReceiptPrintCount: CreationOptional<number>;

  declare notes: CreationOptional<string | null>;
  declare cancelReason: CreationOptional<string | null>;
  /** RN-015: repetir el mismo checkout con la misma clave no crea otro pedido. */
  declare idempotencyKey: CreationOptional<string | null>;

  declare placedAt: CreationOptional<Date>;
  declare confirmedAt: CreationOptional<Date | null>;
  declare deliveredAt: CreationOptional<Date | null>;
  declare cancelledAt: CreationOptional<Date | null>;
  /** Borrado en blando (paranoid). Cancelar NO es borrar: eso vive en `status`. */
  declare deletedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare items?: NonAttribute<OrderItem[]>;
}

Order.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    orderNumber: { type: DataTypes.STRING(20), allowNull: false },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    diningTableId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    waiterId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    source: {
      type: DataTypes.ENUM(...Object.values(ORDER_SOURCE)),
      allowNull: false,
      defaultValue: ORDER_SOURCE.WEB,
    },
    coverageZoneId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    deliveryType: {
      type: DataTypes.ENUM(...Object.values(DELIVERY_TYPE)),
      allowNull: false,
      defaultValue: DELIVERY_TYPE.DELIVERY,
    },
    serviceMode: {
      type: DataTypes.ENUM(...Object.values(SERVICE_MODE)),
      allowNull: false,
      defaultValue: SERVICE_MODE.ASAP,
    },
    deliverySlotId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    scheduledAt: { type: DataTypes.DATE, allowNull: true },
    status: {
      type: DataTypes.ENUM(...Object.values(ORDER_STATUS)),
      allowNull: false,
      defaultValue: ORDER_STATUS.PENDING_PAYMENT,
    },

    addressSnapshotJson: { type: DataTypes.JSON, allowNull: true },
    contactName: { type: DataTypes.STRING(120), allowNull: true },
    contactPhone: { type: DataTypes.STRING(30), allowNull: true },
    whatsappOptInAt: { type: DataTypes.DATE, allowNull: true },
    termsAcceptanceJson: { type: DataTypes.JSON, allowNull: true },
    giftJson: { type: DataTypes.JSON, allowNull: true },
    customerContactJson: { type: DataTypes.JSON, allowNull: true },

    subtotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    deliveryFee: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    cakeDeliveryFee: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    deliveryVehicleType: { type: DataTypes.STRING(16), allowNull: true },
    deliveryHandlingInstructions: { type: DataTypes.STRING(1000), allowNull: true },
    discountTotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    walletAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    taxRate: { type: DataTypes.DECIMAL(5, 4), allowNull: false, defaultValue: 0 },
    taxableBase: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    taxTotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    grandTotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    paymentPlan: { type: DataTypes.ENUM('FULL', 'DEPOSIT_BALANCE'), allowNull: false, defaultValue: 'FULL' },
    depositAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    balanceAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    balanceDueAt: { type: DataTypes.DATE, allowNull: true },
    depositPaidAt: { type: DataTypes.DATE, allowNull: true },
    balancePaidAt: { type: DataTypes.DATE, allowNull: true },
    currency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: CURRENCY },

    documentType: {
      type: DataTypes.ENUM(...Object.values(DOCUMENT_TYPE)),
      allowNull: false,
      defaultValue: DOCUMENT_TYPE.BOLETA,
    },
    billingDocType: { type: DataTypes.ENUM(...Object.values(BILLING_DOC_TYPE)), allowNull: true },
    billingDocNumber: { type: DataTypes.STRING(20), allowNull: true },
    billingName: { type: DataTypes.STRING(200), allowNull: true },
    billingAddress: { type: DataTypes.STRING(200), allowNull: true },
    invoiceStatus: {
      type: DataTypes.ENUM(...Object.values(INVOICE_STATUS)),
      allowNull: false,
      defaultValue: INVOICE_STATUS.PENDING,
    },
    invoiceSeries: { type: DataTypes.STRING(4), allowNull: true },
    invoiceNumber: { type: DataTypes.STRING(8), allowNull: true },
    invoiceIssuedAt: { type: DataTypes.DATE, allowNull: true },
    invoiceProviderReference: { type: DataTypes.STRING(100), allowNull: true },
    invoicePdfUrl: { type: DataTypes.STRING(500), allowNull: true },
    invoiceXmlUrl: { type: DataTypes.STRING(500), allowNull: true },
    internalReceiptFirstPrintedAt: { type: DataTypes.DATE, allowNull: true },
    internalReceiptLastPrintedAt: { type: DataTypes.DATE, allowNull: true },
    internalReceiptPrintCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },

    notes: { type: DataTypes.TEXT, allowNull: true },
    cancelReason: { type: DataTypes.STRING(255), allowNull: true },
    idempotencyKey: { type: DataTypes.STRING(80), allowNull: true },

    placedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    confirmedAt: { type: DataTypes.DATE, allowNull: true },
    deliveredAt: { type: DataTypes.DATE, allowNull: true },
    cancelledAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
    deletedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'Order',
    tableName: 'orders',
    // Un pedido es un comprobante de venta: nunca desaparece de la base. `destroy()`
    // solo marca `deleted_at`, y las consultas normales dejan de verlo. Para borrarlo
    // de verdad hace falta `force: true`, que es una decision explicita y no un
    // descuido. Nueve modelos ya lo tenian; este, el que mas lo necesita, no.
    paranoid: true,
    indexes: [
      { name: 'uq_orders_number', unique: true, fields: ['order_number'] },
      { name: 'uq_orders_idempotency', unique: true, fields: ['idempotency_key'] },
      { name: 'idx_orders_user', fields: ['user_id'] },
      { name: 'idx_orders_branch_status', fields: ['branch_id', 'status'] },
      { name: 'idx_orders_dining_table_status', fields: ['dining_table_id', 'status'] },
      { name: 'idx_orders_scheduled', fields: ['scheduled_at'] },
      // El job de reservas vencidas filtra por status + placed_at cada minuto: sin este
      // indice recorre el historico completo de pedidos, para siempre.
      { name: 'idx_orders_status_placed', fields: ['status', 'placed_at'] },
      // Tablero de pedidos y reportes del panel: filtran por sucursal y rango de fechas.
      { name: 'idx_orders_branch_placed', fields: ['branch_id', 'placed_at'] },
    ],
  },
);

export default Order;
