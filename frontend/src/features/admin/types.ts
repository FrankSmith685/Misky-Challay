export type TicketStatus =
  | 'QUEUED'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'DISPATCHED'
  | 'CANCELLED';

export type DeliveryStatus =
  | 'PENDING'
  | 'ASSIGNED'
  | 'PICKED_UP'
  | 'ON_ROUTE'
  | 'DELIVERED'
  | 'FAILED';

export interface TicketItem {
  id: number;
  name: string;
  quantity: number;
  description: string | null;
  specialInstructions: string | null;
  customizations: Array<{ group: string; option: string; quantity: number }>;
}

export interface KitchenTicket {
  id: number;
  status: TicketStatus;
  priority: number;
  targetAt: string;
  notes: string | null;
  isLate: boolean;
  order: {
    id: number;
    orderNumber: string;
    deliveryType: 'DELIVERY' | 'PICKUP';
    serviceMode: 'ASAP' | 'SCHEDULED';
    contactName: string | null;
    notes: string | null;
    items: TicketItem[];
  } | null;
}

export interface KitchenBoard {
  tickets: KitchenTicket[];
  stats: { queued: number; preparing: number; ready: number; late: number };
}

export interface Driver {
  id: number;
  fullName: string;
  phone: string | null;
  vehicle: string | null;
  status: 'AVAILABLE' | 'BUSY' | 'OFFLINE';
}

export interface DeliveryRow {
  id: number;
  status: DeliveryStatus;
  carrier: 'OWN' | 'EXTERNAL';
  cost: number;
  order: {
    orderNumber: string;
    contactName: string | null;
    contactPhone: string | null;
    grandTotal: number;
    addressSnapshotJson: { line1: string; districtName?: string | null } | null;
  } | null;
  driver: { id: number; fullName: string; phone: string | null } | null;
}

export interface StockRow {
  inventoryItemId: number;
  name: string;
  unit: string;
  onHand: number;
  reserved: number;
  available: number;
  minLevel: number;
  isLow: boolean;
  impactedOptions: string[];
  suggestedSubstitutes: string[];
}

export interface AuditLogRow {
  id: number;
  action: string;
  entity: string;
  entityId: string | null;
  beforeJson: Record<string, unknown> | null;
  afterJson: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminOrderRow {
  id: number;
  orderNumber: string;
  status: string;
  deliveryType: 'DELIVERY' | 'PICKUP';
  grandTotal: number;
  placedAt: string;
  contactName: string | null;
  branch?: { id: number; name: string } | null;
  kitchenTicket?: { id: number; status: TicketStatus } | null;
  items: Array<{ id: number; productNameSnapshot: string; quantity: number }>;
}

export interface Reports {
  range: { from: string; to: string };
  sales: {
    orders: number;
    revenue: number;
    averageTicket: number;
    discounts: number;
    deliveryShare: number;
  };
  quality: { cancelled: number; cancellationRate: number };
  operations: { avgPrepMinutes: number; ticketsMeasured: number };
  experience: Partial<Record<'COVERAGE_SUCCESS' | 'COVERAGE_FAIL' | 'COVERAGE_ERROR' | 'CHECKOUT_START' | 'CHECKOUT_ERROR' | 'PAYMENT_REDIRECT', number>>;
  topProducts: Array<{ name: string; units: number; revenue: number }>;
}
