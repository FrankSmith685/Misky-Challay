import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';

/** Libro de caja: jornadas conciliables y movimientos auditables por sucursal. */
export const up = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  const tables = await q.showAllTables() as string[];
  if (!tables.includes('cash_sessions')) {
    await q.createTable('cash_sessions', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      branch_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, references: { model: 'branches', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
      business_date: { type: DataTypes.DATEONLY, allowNull: false },
      status: { type: DataTypes.ENUM('OPEN', 'CLOSED'), allowNull: false, defaultValue: 'OPEN' },
      opened_by: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
      opened_at: { type: DataTypes.DATE, allowNull: false },
      opening_float: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      closed_by: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      closed_at: { type: DataTypes.DATE, allowNull: true },
      expected_cash: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      declared_cash: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      variance: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      closing_notes: { type: DataTypes.STRING(500), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
    await q.addIndex('cash_sessions', ['branch_id', 'business_date'], { name: 'idx_cash_sessions_branch_date' });
    await q.addIndex('cash_sessions', ['branch_id', 'status'], { name: 'idx_cash_sessions_open' });
  }
  if (!tables.includes('cash_movements')) {
    await q.createTable('cash_movements', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      session_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, references: { model: 'cash_sessions', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
      branch_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, references: { model: 'branches', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
      type: { type: DataTypes.ENUM('SALE', 'REFUND', 'EXPENSE', 'CASH_IN', 'CASH_OUT', 'ADJUSTMENT'), allowNull: false },
      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      payment_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, references: { model: 'payments', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      order_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, references: { model: 'orders', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      reason: { type: DataTypes.STRING(255), allowNull: false },
      actor_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
    await q.addIndex('cash_movements', ['session_id', 'created_at'], { name: 'idx_cash_movements_session' });
    await q.addIndex('cash_movements', ['payment_id'], { name: 'idx_cash_movements_payment' });
    await q.addIndex('cash_movements', ['order_id'], { name: 'idx_cash_movements_order' });
  }
};

export const down = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  const tables = await q.showAllTables() as string[];
  if (tables.includes('cash_movements')) await q.dropTable('cash_movements');
  if (tables.includes('cash_sessions')) await q.dropTable('cash_sessions');
};
