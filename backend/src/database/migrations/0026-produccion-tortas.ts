import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, addIndexIfMissing, removeColumnIfPresent, tableExists } from '../migrationHelpers';

const dates = {
  created_at: { type: DataTypes.DATE, allowNull: false },
  updated_at: { type: DataTypes.DATE, allowNull: false },
};
const id = { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true };
const stations = ['DESIGN', 'BAKING', 'COOLING', 'FILLING', 'DECORATING', 'QA', 'DISPATCH'];

export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(context, 'customization_options', 'production_minutes_json', {
    type: DataTypes.JSON, allowNull: false, defaultValue: {},
  });
  await addColumnIfMissing(context, 'product_variants', 'production_minutes_json', {
    type: DataTypes.JSON, allowNull: false, defaultValue: {},
  });
  if (!(await tableExists(context, 'cake_product_profiles'))) await context.createTable('cake_product_profiles', {
    product_id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, allowNull: false },
    sale_mode: { type: DataTypes.ENUM('STANDARD', 'SEMI_CUSTOM', 'ADVANCED'), allowNull: false },
    min_lead_hours: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    base_effort_json: { type: DataTypes.JSON, allowNull: false },
    station_offsets_json: { type: DataTypes.JSON, allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }, ...dates,
  });
  if (!(await tableExists(context, 'cake_station_capacities'))) await context.createTable('cake_station_capacities', {
    id, branch_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    work_date: { type: DataTypes.DATEONLY, allowNull: false },
    station: { type: DataTypes.ENUM(...stations), allowNull: false },
    capacity_minutes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    reserved_minutes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    confirmed_minutes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 }, ...dates,
  });
  await addIndexIfMissing(context, 'cake_station_capacities', ['branch_id', 'work_date', 'station'], { name: 'uq_cake_capacity', unique: true });
  if (!(await tableExists(context, 'cake_capacity_reservations'))) await context.createTable('cake_capacity_reservations', {
    id, order_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    capacity_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    minutes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    status: { type: DataTypes.ENUM('HELD', 'CONFIRMED', 'RELEASED'), allowNull: false }, ...dates,
  });
  await addIndexIfMissing(context, 'cake_capacity_reservations', ['order_id', 'capacity_id'], { name: 'uq_cake_reservation', unique: true });
  if (!(await tableExists(context, 'cake_production_tasks'))) await context.createTable('cake_production_tasks', {
    id, order_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    branch_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    station: { type: DataTypes.ENUM(...stations), allowNull: false },
    sequence: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
    planned_minutes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    work_date: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.ENUM('PENDING', 'IN_PROGRESS', 'DONE', 'BLOCKED'), allowNull: false, defaultValue: 'PENDING' },
    assigned_to: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    checklist_json: { type: DataTypes.JSON, allowNull: true },
    evidence_url: { type: DataTypes.STRING(500), allowNull: true },
    evidence_mime: { type: DataTypes.STRING(40), allowNull: true },
    evidence_bytes: { type: DataTypes.BLOB('long'), allowNull: true },
    started_at: { type: DataTypes.DATE, allowNull: true },
    completed_at: { type: DataTypes.DATE, allowNull: true }, ...dates,
  });
  await addIndexIfMissing(context, 'cake_production_tasks', ['order_id', 'station', 'work_date'], { name: 'uq_cake_task_order_station_date', unique: true });
  await addIndexIfMissing(context, 'cake_production_tasks', ['branch_id', 'work_date', 'status'], { name: 'idx_cake_tasks_board' });
  if (!(await tableExists(context, 'cake_design_requests'))) await context.createTable('cake_design_requests', {
    id, user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    branch_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    product_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    variant_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    desired_at: { type: DataTypes.DATE, allowNull: false },
    selections_json: { type: DataTypes.JSON, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    reference_mime: { type: DataTypes.STRING(30), allowNull: false },
    reference_bytes: { type: DataTypes.BLOB('long'), allowNull: false },
    status: { type: DataTypes.ENUM('SUBMITTED', 'QUOTED', 'ACCEPTED', 'REJECTED'), allowNull: false, defaultValue: 'SUBMITTED' }, ...dates,
  });
  await addIndexIfMissing(context, 'cake_design_requests', ['user_id', 'created_at'], { name: 'idx_cake_design_user' });
  if (!(await tableExists(context, 'cake_design_quotes'))) await context.createTable('cake_design_quotes', {
    id, request_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    effort_json: { type: DataTypes.JSON, allowNull: false },
    proposed_at: { type: DataTypes.DATE, allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    terms: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.ENUM('PROPOSED', 'ACCEPTED', 'SUPERSEDED', 'EXPIRED'), allowNull: false, defaultValue: 'PROPOSED' },
    created_by: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    accepted_at: { type: DataTypes.DATE, allowNull: true },
    order_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true }, ...dates,
  });
  await addIndexIfMissing(context, 'cake_design_quotes', ['request_id', 'version'], { name: 'uq_cake_quote_version', unique: true });
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  for (const table of ['cake_design_quotes', 'cake_design_requests', 'cake_production_tasks', 'cake_capacity_reservations', 'cake_station_capacities', 'cake_product_profiles']) {
    if (await tableExists(context, table)) await context.dropTable(table);
  }
  await removeColumnIfPresent(context, 'customization_options', 'production_minutes_json');
  await removeColumnIfPresent(context, 'product_variants', 'production_minutes_json');
};
