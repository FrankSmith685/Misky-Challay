import { Transaction } from 'sequelize';
import { Wallet, WalletTransaction, sequelize } from '@database/models';
import { CURRENCY, WALLET_TX_TYPE, type WalletTxType } from '@config/constants';
import { ApiError } from '@shared/errors/ApiError';
import { buildMeta, getPagination, type PaginationQuery } from '@shared/utils/pagination';

const round2 = (value: number): number => Math.round(value * 100) / 100;

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
}

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
    const wallet = await Wallet.findOne({ where: { userId, currency: CURRENCY } });
    return wallet ? Number(wallet.balance) : 0;
  },

  /**
   * Registra un movimiento y actualiza el saldo EN LA MISMA TRANSACCION.
   * Es el unico camino para mover dinero: no existe "editar el saldo" (RN-013).
   */
  async move(input: MovementInput, externalTransaction?: Transaction): Promise<WalletTransaction> {
    if (input.amount <= 0) throw ApiError.badRequest('El importe debe ser positivo');

    const run = async (transaction: Transaction): Promise<WalletTransaction> => {
      // Idempotencia: si la clave ya existe, se devuelve el movimiento original.
      const existing = await WalletTransaction.findOne({
        where: { idempotencyKey: input.idempotencyKey },
        transaction,
      });
      if (existing) return existing;

      // La billetera se bloquea mientras dura el movimiento: dos pedidos
      // simultaneos no pueden gastar el mismo saldo.
      await walletService.getOrCreate(input.userId, transaction);
      const wallet = await Wallet.findOne({
        where: { userId: input.userId, currency: CURRENCY },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!wallet) throw ApiError.internal('No se pudo abrir la billetera');

      const current = Number(wallet.balance);
      const isCredit = CREDIT_TYPES.includes(input.type);
      const amount = round2(input.amount);

      if (!isCredit && amount > current) {
        throw ApiError.unprocessable('Saldo insuficiente');
      }

      const balanceAfter = round2(isCredit ? current + amount : current - amount);

      wallet.balance = balanceAfter;
      await wallet.save({ transaction });

      return WalletTransaction.create(
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
    };

    if (externalTransaction) return run(externalTransaction);
    return sequelize.transaction(run);
  },

  /** Movimientos del cliente, del mas nuevo al mas viejo. */
  async listTransactions(userId: number, query: PaginationQuery) {
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
