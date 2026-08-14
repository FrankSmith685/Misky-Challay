import { Op, Transaction } from 'sequelize';
import {
  Wallet,
  WalletCreditLot,
  WalletLotAllocation,
  WalletTransaction,
  sequelize,
} from '@database/models';
import {
  CURRENCY,
  PAID_CREDIT_VALIDITY_DAYS,
  WALLET_LOT_KIND,
  WALLET_LOT_STATUS,
  WALLET_TX_TYPE,
  type WalletLotKind,
  type WalletTxType,
} from '@config/constants';
import { ApiError } from '@shared/errors/ApiError';
import { buildMeta, getPagination, type PaginationQuery } from '@shared/utils/pagination';

const DAY = 24 * 60 * 60 * 1000;
const round2 = (value: number): number => Math.round(value * 100) / 100;
const paidExpiryFrom = (date = new Date()): Date =>
  new Date(date.getTime() + PAID_CREDIT_VALIDITY_DAYS * DAY);

/** Los movimientos que suman saldo. El resto lo restan. */
const CREDIT_TYPES: WalletTxType[] = [WALLET_TX_TYPE.CREDIT, WALLET_TX_TYPE.REFUND];

export interface MovementInput {
  userId: number;
  type: WalletTxType;
  amount: number;
  description: string;
  /** RN-013 + RN-015: la misma clave nunca crea dos movimientos. */
  idempotencyKey: string;
  userPlanId?: number | null;
  orderId?: number | null;
  expiresAt?: Date | null;
  /** Obligatorio conceptualmente para créditos; PAID es el valor seguro por defecto. */
  lotKind?: WalletLotKind;
}

const createLot = async (
  wallet: Wallet,
  movement: WalletTransaction,
  input: MovementInput,
  transaction: Transaction,
): Promise<WalletCreditLot> =>
  WalletCreditLot.create(
    {
      walletId: wallet.id,
      userPlanId: input.userPlanId ?? null,
      sourceTransactionId: movement.id,
      kind: input.lotKind ?? WALLET_LOT_KIND.PAID,
      initialAmount: round2(input.amount),
      remainingAmount: round2(input.amount),
      expiresAt: input.expiresAt ?? paidExpiryFrom(),
      status: WALLET_LOT_STATUS.ACTIVE,
    },
    { transaction },
  );

/**
 * Compatibilidad para billeteras creadas antes de los lotes. El saldo histórico se
 * preserva como LEGACY sin vencimiento; nunca se inventa saldo porque solo cubre la
 * diferencia contra el total contable que ya existía.
 */
const ensureLegacyLot = async (wallet: Wallet, transaction: Transaction): Promise<void> => {
  const active = await WalletCreditLot.sum('remainingAmount', {
    where: { walletId: wallet.id, status: WALLET_LOT_STATUS.ACTIVE },
    transaction,
  });
  const missing = round2(Number(wallet.balance) - Number(active ?? 0));
  if (missing <= 0) return;

  await WalletCreditLot.create(
    {
      walletId: wallet.id,
      kind: WALLET_LOT_KIND.LEGACY,
      initialAmount: missing,
      remainingAmount: missing,
      expiresAt: null,
      status: WALLET_LOT_STATUS.ACTIVE,
    },
    { transaction },
  );
};

/** Anula solamente el remanente del lote vencido y deja intactos todos los demás. */
const expireDueLotsForWallet = async (
  wallet: Wallet,
  transaction: Transaction,
  now = new Date(),
): Promise<number> => {
  const due = await WalletCreditLot.findAll({
    where: {
      walletId: wallet.id,
      status: WALLET_LOT_STATUS.ACTIVE,
      remainingAmount: { [Op.gt]: 0 },
      expiresAt: { [Op.lte]: now },
    },
    order: [['expiresAt', 'ASC'], ['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  let balance = Number(wallet.balance);
  let expiredTotal = 0;

  for (const lot of due) {
    const amount = round2(Math.min(Number(lot.remainingAmount), balance));
    lot.remainingAmount = 0;
    lot.status = WALLET_LOT_STATUS.EXPIRED;
    await lot.save({ transaction });

    if (amount <= 0) continue;
    balance = round2(balance - amount);
    expiredTotal = round2(expiredTotal + amount);
    await WalletTransaction.findOrCreate({
      where: { idempotencyKey: `lot-${lot.id}-expiration` },
      defaults: {
        walletId: wallet.id,
        type: WALLET_TX_TYPE.EXPIRATION,
        amount,
        balanceAfter: balance,
        userPlanId: lot.userPlanId,
        orderId: null,
        expiresAt: null,
        idempotencyKey: `lot-${lot.id}-expiration`,
        description:
          lot.kind === WALLET_LOT_KIND.BONUS
            ? 'Bono promocional vencido'
            : 'Saldo vencido',
      },
      transaction,
    });
  }

  if (expiredTotal > 0) {
    wallet.balance = balance;
    await wallet.save({ transaction });
  }

  return expiredTotal;
};

/** FEFO: usa primero el saldo cuya fecha de vencimiento está más cerca. */
const allocateDebit = async (
  wallet: Wallet,
  movement: WalletTransaction,
  amount: number,
  transaction: Transaction,
): Promise<void> => {
  const lots = await WalletCreditLot.findAll({
    where: {
      walletId: wallet.id,
      status: WALLET_LOT_STATUS.ACTIVE,
      remainingAmount: { [Op.gt]: 0 },
      [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: new Date() } }],
    },
    // MySQL ordena NULL primero; el booleano coloca los lotes sin vencimiento al final.
    order: [[sequelize.literal('expires_at IS NULL'), 'ASC'], ['expiresAt', 'ASC'], ['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  let pending = round2(amount);
  for (const lot of lots) {
    if (pending <= 0) break;
    const used = round2(Math.min(Number(lot.remainingAmount), pending));
    if (used <= 0) continue;

    lot.remainingAmount = round2(Number(lot.remainingAmount) - used);
    if (Number(lot.remainingAmount) === 0) lot.status = WALLET_LOT_STATUS.EXHAUSTED;
    await lot.save({ transaction });

    await WalletLotAllocation.create(
      { walletTransactionId: movement.id, walletCreditLotId: lot.id, amount: used },
      { transaction },
    );
    pending = round2(pending - used);
  }

  if (pending > 0) throw ApiError.unprocessable('Saldo disponible insuficiente');
};

/**
 * Una cancelación restaura los lotes originales si aún son válidos. Si alguno ya
 * venció mientras el pedido estaba en curso, ese importe vuelve como devolución
 * con 180 días para no perjudicar al cliente por una cancelación posterior.
 */
const restoreRefund = async (
  wallet: Wallet,
  movement: WalletTransaction,
  input: MovementInput,
  transaction: Transaction,
): Promise<void> => {
  const debit = input.orderId
    ? await WalletTransaction.findOne({
        where: { walletId: wallet.id, orderId: input.orderId, type: WALLET_TX_TYPE.DEBIT },
        transaction,
      })
    : null;
  const allocations = debit
    ? await WalletLotAllocation.findAll({
        where: { walletTransactionId: debit.id },
        transaction,
      })
    : [];

  let restored = 0;
  let reissued = 0;
  for (const allocation of allocations) {
    const lot = await WalletCreditLot.findByPk(allocation.walletCreditLotId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!lot) continue;

    const amount = Number(allocation.amount);
    if (!lot.expiresAt || lot.expiresAt > new Date()) {
      lot.remainingAmount = round2(Number(lot.remainingAmount) + amount);
      lot.status = WALLET_LOT_STATUS.ACTIVE;
      await lot.save({ transaction });
    } else {
      reissued = round2(reissued + amount);
    }
    restored = round2(restored + amount);
  }

  // Débitos históricos no tenían asignaciones; también se restituyen de forma segura.
  reissued = round2(reissued + Math.max(0, Number(input.amount) - restored));
  if (reissued > 0) {
    await WalletCreditLot.create(
      {
        walletId: wallet.id,
        userPlanId: input.userPlanId ?? null,
        sourceTransactionId: movement.id,
        kind: WALLET_LOT_KIND.REFUND,
        initialAmount: reissued,
        remainingAmount: reissued,
        expiresAt: paidExpiryFrom(),
        status: WALLET_LOT_STATUS.ACTIVE,
      },
      { transaction },
    );
  }
};

export const walletService = {
  /** Devuelve (o crea) la billetera del cliente. */
  async getOrCreate(userId: number, transaction?: Transaction): Promise<Wallet> {
    const [wallet] = await Wallet.findOrCreate({
      where: { userId, currency: CURRENCY },
      defaults: { userId, currency: CURRENCY, balance: 0 },
      transaction,
    });
    return wallet;
  },

  async getBalance(userId: number): Promise<number> {
    return sequelize.transaction(async (transaction) => {
      const wallet = await Wallet.findOne({
        where: { userId, currency: CURRENCY },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!wallet) return 0;
      await expireDueLotsForWallet(wallet, transaction);
      await ensureLegacyLot(wallet, transaction);
      return Number(wallet.balance);
    });
  },

  /** Lotes disponibles para explicar al cliente de dónde sale su saldo. */
  async activeLots(userId: number): Promise<WalletCreditLot[]> {
    await walletService.getBalance(userId); // aplica vencimientos antes de responder
    const wallet = await Wallet.findOne({ where: { userId, currency: CURRENCY } });
    if (!wallet) return [];
    return WalletCreditLot.findAll({
      where: {
        walletId: wallet.id,
        status: WALLET_LOT_STATUS.ACTIVE,
        remainingAmount: { [Op.gt]: 0 },
      },
      order: [[sequelize.literal('expires_at IS NULL'), 'ASC'], ['expiresAt', 'ASC'], ['id', 'ASC']],
    });
  },

  /**
   * Registra un movimiento y actualiza el saldo EN LA MISMA TRANSACCION.
   * Es el unico camino para mover dinero: no existe "editar el saldo" (RN-013).
   */
  async move(input: MovementInput, externalTransaction?: Transaction): Promise<WalletTransaction> {
    if (input.amount <= 0) throw ApiError.badRequest('El importe debe ser positivo');

    const run = async (transaction: Transaction): Promise<WalletTransaction> => {
      const existing = await WalletTransaction.findOne({
        where: { idempotencyKey: input.idempotencyKey },
        transaction,
      });
      if (existing) return existing;

      await walletService.getOrCreate(input.userId, transaction);
      const wallet = await Wallet.findOne({
        where: { userId: input.userId, currency: CURRENCY },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!wallet) throw ApiError.internal('No se pudo abrir la billetera');

      await expireDueLotsForWallet(wallet, transaction);
      await ensureLegacyLot(wallet, transaction);

      const current = Number(wallet.balance);
      const isCredit = CREDIT_TYPES.includes(input.type);
      const amount = round2(input.amount);
      if (!isCredit && amount > current) throw ApiError.unprocessable('Saldo insuficiente');

      const balanceAfter = round2(isCredit ? current + amount : current - amount);
      wallet.balance = balanceAfter;
      await wallet.save({ transaction });

      const movement = await WalletTransaction.create(
        {
          walletId: wallet.id,
          type: input.type,
          amount,
          balanceAfter,
          userPlanId: input.userPlanId ?? null,
          orderId: input.orderId ?? null,
          expiresAt: input.expiresAt ?? null,
          idempotencyKey: input.idempotencyKey,
          description: input.description,
        },
        { transaction },
      );

      if (input.type === WALLET_TX_TYPE.CREDIT) {
        await createLot(wallet, movement, { ...input, amount }, transaction);
      } else if (input.type === WALLET_TX_TYPE.REFUND) {
        await restoreRefund(wallet, movement, { ...input, amount }, transaction);
      } else {
        await allocateDebit(wallet, movement, amount, transaction);
      }

      return movement;
    };

    if (externalTransaction) return run(externalTransaction);
    return sequelize.transaction(run);
  },

  /** Expira lotes de todos los clientes. Es idempotente y seguro ante reintentos. */
  async expireDueLots(): Promise<{ lotsExpired: number; creditVoided: number }> {
    const due = await WalletCreditLot.findAll({
      attributes: ['id', 'walletId'],
      where: {
        status: WALLET_LOT_STATUS.ACTIVE,
        remainingAmount: { [Op.gt]: 0 },
        expiresAt: { [Op.lte]: new Date() },
      },
    });
    const walletIds = [...new Set(due.map((lot) => lot.walletId))];
    let creditVoided = 0;

    for (const walletId of walletIds) {
      creditVoided = round2(
        creditVoided +
          (await sequelize.transaction(async (transaction) => {
            const wallet = await Wallet.findByPk(walletId, {
              transaction,
              lock: transaction.LOCK.UPDATE,
            });
            return wallet ? expireDueLotsForWallet(wallet, transaction) : 0;
          })),
      );
    }

    return { lotsExpired: due.length, creditVoided };
  },

  /** Movimientos del cliente, del mas nuevo al mas viejo. */
  async listTransactions(userId: number, query: PaginationQuery) {
    await walletService.getBalance(userId);
    const wallet = await Wallet.findOne({ where: { userId, currency: CURRENCY } });
    if (!wallet) return { transactions: [], meta: buildMeta(getPagination(query), 0) };

    const pagination = getPagination(query);
    const { rows, count } = await WalletTransaction.findAndCountAll({
      where: { walletId: wallet.id },
      order: [['id', 'DESC']],
      limit: pagination.limit,
      offset: pagination.offset,
    });

    return { transactions: rows, meta: buildMeta(pagination, count) };
  },
};

export type WalletService = typeof walletService;
