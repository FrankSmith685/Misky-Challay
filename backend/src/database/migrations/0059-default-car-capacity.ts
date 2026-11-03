import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';

export const up = async ({ context: q }: MigrationParams<QueryInterface>) => {
  if (!(await q.describeTable('branches')).default_car_capacity) {
    await q.addColumn('branches', 'default_car_capacity', { type: DataTypes.INTEGER, allowNull: false, defaultValue: 10 });
  }
  // Set the approved initial capacity for unconfigured future slots; preserve managed limits.
  await q.sequelize.query(`UPDATE delivery_slots s JOIN branches b ON b.id=s.branch_id
    SET s.car_capacity=LEAST(s.capacity,b.default_car_capacity),s.updated_at=NOW()
    WHERE s.is_active=1 AND s.order_cutoff_at>NOW() AND s.car_capacity=0
      AND b.is_active=1 AND b.accepts_delivery=1 AND b.deleted_at IS NULL`);
};
