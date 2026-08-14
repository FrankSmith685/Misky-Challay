import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, removeColumnIfPresent } from '../migrationHelpers';

/**
 * Separa el saldo agregado en lotes auditables.
 *
 * El saldo que ya existía antes de esta migración se conserva íntegramente como
 * LEGACY y sin vencimiento: cambiar la política nunca debe recortar dinero anterior.
 */
export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(context, 'user_plans', 'terms_accepted_at', {
    type: DataTypes.DATE,
    allowNull: true,
  });
  await addColumnIfMissing(context, 'user_plans', 'terms_version', {
    type: DataTypes.STRING(20),
    allowNull: true,
  });

  let tables = (await context.showAllTables()).map((table) => String(table).toLowerCase());
  if (!tables.includes('wallet_credit_lots')) {
    await context.createTable('wallet_credit_lots', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      wallet_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'wallets', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      user_plan_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        references: { model: 'user_plans', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      source_transaction_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        references: { model: 'wallet_transactions', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      kind: {
        type: DataTypes.ENUM('PAID', 'BONUS', 'REFUND', 'LEGACY'),
        allowNull: false,
      },
      initial_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      remaining_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      expires_at: { type: DataTypes.DATE, allowNull: true },
      status: {
        type: DataTypes.ENUM('ACTIVE', 'EXHAUSTED', 'EXPIRED'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      created_at: { type: DataTypes.DATE, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    });
    await context.addIndex('wallet_credit_lots', {
      name: 'uq_wallet_credit_lots_source_tx',
      unique: true,
      fields: ['source_transaction_id'],
    });
    await context.addIndex('wallet_credit_lots', {
      name: 'idx_wallet_credit_lots_spend',
      fields: ['wallet_id', 'status', 'expires_at'],
    });
    await context.addIndex('wallet_credit_lots', {
      name: 'idx_wallet_credit_lots_plan',
      fields: ['user_plan_id'],
    });
  }

  tables = (await context.showAllTables()).map((table) => String(table).toLowerCase());
  if (!tables.includes('wallet_lot_allocations')) {
    await context.createTable('wallet_lot_allocations', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      wallet_transaction_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'wallet_transactions', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      wallet_credit_lot_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'wallet_credit_lots', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: true },
      updated_at: { type: DataTypes.DATE, allowNull: true },
    });
    await context.addIndex('wallet_lot_allocations', {
      name: 'uq_wallet_lot_allocations_tx_lot',
      unique: true,
      fields: ['wallet_transaction_id', 'wallet_credit_lot_id'],
    });
    await context.addIndex('wallet_lot_allocations', {
      name: 'idx_wallet_lot_allocations_lot',
      fields: ['wallet_credit_lot_id'],
    });
  }

  await context.sequelize.query(`
    INSERT INTO wallet_credit_lots
      (wallet_id, user_plan_id, source_transaction_id, kind, initial_amount,
       remaining_amount, expires_at, status, created_at, updated_at)
    SELECT w.id, NULL, NULL, 'LEGACY', w.balance, w.balance, NULL, 'ACTIVE', NOW(), NOW()
      FROM wallets w
     WHERE w.balance > 0
       AND NOT EXISTS (
         SELECT 1 FROM wallet_credit_lots l WHERE l.wallet_id = w.id
       )
  `);
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  const tables = (await context.showAllTables()).map((table) => String(table).toLowerCase());
  if (tables.includes('wallet_lot_allocations')) await context.dropTable('wallet_lot_allocations');
  if (tables.includes('wallet_credit_lots')) await context.dropTable('wallet_credit_lots');
  await removeColumnIfPresent(context, 'user_plans', 'terms_version');
  await removeColumnIfPresent(context, 'user_plans', 'terms_accepted_at');
};
