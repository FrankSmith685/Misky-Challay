export type BenefitType = 'DISCOUNT_PERCENT' | 'FREE_DELIVERY';

export interface PlanBenefit {
  id: number;
  type: BenefitType;
  value: number;
  maxAmountPerOrder: number | null;
  description: string;
}

export interface Plan {
  id: number;
  code: string;
  name: string;
  description: string | null;
  /** Lo que paga el cliente. */
  price: number;
  /** El saldo que recibe (la diferencia es la bonificacion). */
  grantedCredit: number;
  validityDays: number;
  isFeatured: boolean;
  benefits: PlanBenefit[];
}

export interface ActivePlan {
  id: number;
  name: string;
  credit: number;
  expiresAt: string | null;
  benefits: Array<{ type: BenefitType; description: string }>;
}

export interface WalletSummary {
  balance: number;
  currency: string;
  expiresAt: string | null;
  activePlans: ActivePlan[];
}

export interface WalletTransaction {
  id: number;
  type: 'CREDIT' | 'DEBIT' | 'ADJUSTMENT' | 'EXPIRATION' | 'REFUND';
  amount: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
}

export interface PlanPurchase {
  userPlanId: number | null;
  status: string | null;
  checkoutUrl: string | null;
  reused: boolean;
}
