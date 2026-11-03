import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../connection';
import type { CakeThemeSnapshot } from './cakeTheme.model';
import type { CakeVisualDesign } from '../../modules/cakes/cakeVisualDesign';

export const CAKE_STATIONS = ['DESIGN', 'BAKING', 'COOLING', 'FILLING', 'DECORATING', 'QA', 'DISPATCH'] as const;
export type CakeStation = (typeof CAKE_STATIONS)[number];
export type CakeEffort = Partial<Record<CakeStation, number>>;
export interface CakeDesignBrief {
  visualDesign?: CakeVisualDesign;
  occasion: string;
  theme: string;
  style: string;
  colors: string[];
  servings: number | null;
  message: string;
  budget: string;
  notes: string;
  flavor?: string;
  filling?: string;
  selectedOptions?: Array<{ optionId?: number; group: string; option: string; quantity: number }>;
}
export type CakeOffsets = Partial<Record<CakeStation, number>>;
export interface CakeSizeGuide {
  variantId: number;
  diameterCm: number;
  minServings: number;
  maxServings: number;
}
export interface CakeCustomServings {
  enabled: boolean;
  baseVariantId: number | null;
  minServings: number;
  maxServings: number;
  pricePerExtraServing: number;
  /** Public size labels. maxServings matches the recipe's servingSize. */
  sizeGuides?: CakeSizeGuide[];
}

export class CakeProductProfile extends Model<InferAttributes<CakeProductProfile>, InferCreationAttributes<CakeProductProfile>> {
  declare productId: number;
  declare saleMode: 'STANDARD' | 'SEMI_CUSTOM' | 'ADVANCED';
  declare minLeadHours: number;
  declare baseEffortJson: CakeEffort;
  declare stationOffsetsJson: CakeOffsets;
  declare customServingsJson: CreationOptional<CakeCustomServings>;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
CakeProductProfile.init({
  productId: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, allowNull: false },
  saleMode: { type: DataTypes.ENUM('STANDARD', 'SEMI_CUSTOM', 'ADVANCED'), allowNull: false },
  minLeadHours: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  baseEffortJson: { type: DataTypes.JSON, allowNull: false },
  stationOffsetsJson: { type: DataTypes.JSON, allowNull: false },
  customServingsJson: { type: DataTypes.JSON, allowNull: false, defaultValue: { enabled: false, baseVariantId: null, minServings: 21, maxServings: 60, pricePerExtraServing: 0 } },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  createdAt: DataTypes.DATE, updatedAt: DataTypes.DATE,
}, { sequelize, modelName: 'CakeProductProfile', tableName: 'cake_product_profiles' });

export class CakeStationCapacity extends Model<InferAttributes<CakeStationCapacity>, InferCreationAttributes<CakeStationCapacity>> {
  declare id: CreationOptional<number>;
  declare branchId: number;
  declare workDate: string;
  declare station: CakeStation;
  declare capacityMinutes: number;
  declare reservedMinutes: CreationOptional<number>;
  declare confirmedMinutes: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
CakeStationCapacity.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  workDate: { type: DataTypes.DATEONLY, allowNull: false },
  station: { type: DataTypes.ENUM(...CAKE_STATIONS), allowNull: false },
  capacityMinutes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  reservedMinutes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
  confirmedMinutes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
  createdAt: DataTypes.DATE, updatedAt: DataTypes.DATE,
}, { sequelize, modelName: 'CakeStationCapacity', tableName: 'cake_station_capacities', indexes: [
  { name: 'uq_cake_capacity', unique: true, fields: ['branch_id', 'work_date', 'station'] },
] });

export class CakeCapacityReservation extends Model<InferAttributes<CakeCapacityReservation>, InferCreationAttributes<CakeCapacityReservation>> {
  declare id: CreationOptional<number>;
  declare orderId: number;
  declare capacityId: number;
  declare minutes: number;
  declare status: 'HELD' | 'CONFIRMED' | 'RELEASED';
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
CakeCapacityReservation.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  orderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  capacityId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  minutes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  status: { type: DataTypes.ENUM('HELD', 'CONFIRMED', 'RELEASED'), allowNull: false },
  createdAt: DataTypes.DATE, updatedAt: DataTypes.DATE,
}, { sequelize, modelName: 'CakeCapacityReservation', tableName: 'cake_capacity_reservations', indexes: [
  { name: 'uq_cake_reservation', unique: true, fields: ['order_id', 'capacity_id'] },
] });

export class CakeProductionTask extends Model<InferAttributes<CakeProductionTask>, InferCreationAttributes<CakeProductionTask>> {
  declare id: CreationOptional<number>;
  declare orderId: number;
  declare branchId: number;
  declare station: CakeStation;
  declare sequence: number;
  declare plannedMinutes: number;
  declare workDate: string;
  declare status: CreationOptional<'PENDING' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'>;
  declare assignedTo: CreationOptional<number | null>;
  declare checklistJson: CreationOptional<Record<string, boolean> | null>;
  declare materialPlanJson: CreationOptional<Record<string, number> | null>;
  declare materialConsumedJson: CreationOptional<Record<string, number> | null>;
  declare materialWasteJson: CreationOptional<Record<string, number> | null>;
  declare evidenceUrl: CreationOptional<string | null>;
  declare evidenceMime: CreationOptional<string | null>;
  declare evidenceBytes: CreationOptional<Buffer | null>;
  declare startedAt: CreationOptional<Date | null>;
  declare completedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
CakeProductionTask.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  orderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  station: { type: DataTypes.ENUM(...CAKE_STATIONS), allowNull: false },
  sequence: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
  plannedMinutes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  workDate: { type: DataTypes.DATEONLY, allowNull: false },
  status: { type: DataTypes.ENUM('PENDING', 'IN_PROGRESS', 'DONE', 'BLOCKED'), allowNull: false, defaultValue: 'PENDING' },
  assignedTo: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  checklistJson: { type: DataTypes.JSON, allowNull: true },
  materialPlanJson: { type: DataTypes.JSON, allowNull: true },
  materialConsumedJson: { type: DataTypes.JSON, allowNull: true },
  materialWasteJson: { type: DataTypes.JSON, allowNull: true },
  evidenceUrl: { type: DataTypes.STRING(500), allowNull: true },
  evidenceMime: { type: DataTypes.STRING(40), allowNull: true },
  evidenceBytes: { type: DataTypes.BLOB('long'), allowNull: true },
  startedAt: { type: DataTypes.DATE, allowNull: true },
  completedAt: { type: DataTypes.DATE, allowNull: true },
  createdAt: DataTypes.DATE, updatedAt: DataTypes.DATE,
}, { sequelize, modelName: 'CakeProductionTask', tableName: 'cake_production_tasks', indexes: [
  { name: 'uq_cake_task_order_station_date', unique: true, fields: ['order_id', 'station', 'work_date'] },
  { name: 'idx_cake_tasks_board', fields: ['branch_id', 'work_date', 'status'] },
] });

export class CakeDesignRequest extends Model<InferAttributes<CakeDesignRequest>, InferCreationAttributes<CakeDesignRequest>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare branchId: number;
  declare productId: number;
  declare variantId: number;
  declare desiredAt: Date;
  declare selectionsJson: Array<{ optionId: number; quantity: number }>;
  declare description: string;
  declare briefJson: CakeDesignBrief;
  declare requestKind: CreationOptional<'ADVANCED' | 'FREEFORM'>;
  declare themeSnapshotJson: CreationOptional<CakeThemeSnapshot | null>;
  declare referenceMime: CreationOptional<string | null>;
  declare referenceBytes: CreationOptional<Buffer | null>;
  declare whatsappOptInAt: CreationOptional<Date | null>;
  declare status: CreationOptional<'SUBMITTED' | 'QUOTED' | 'ACCEPTED' | 'REJECTED'>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
CakeDesignRequest.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  productId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  variantId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  desiredAt: { type: DataTypes.DATE, allowNull: false },
  selectionsJson: { type: DataTypes.JSON, allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: false },
  briefJson: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  requestKind: { type: DataTypes.ENUM('ADVANCED', 'FREEFORM'), allowNull: false, defaultValue: 'ADVANCED' },
  themeSnapshotJson: { type: DataTypes.JSON, allowNull: true },
  referenceMime: { type: DataTypes.STRING(30), allowNull: true },
  referenceBytes: { type: DataTypes.BLOB('long'), allowNull: true },
  whatsappOptInAt: { type: DataTypes.DATE, allowNull: true },
  status: { type: DataTypes.ENUM('SUBMITTED', 'QUOTED', 'ACCEPTED', 'REJECTED'), allowNull: false, defaultValue: 'SUBMITTED' },
  createdAt: DataTypes.DATE, updatedAt: DataTypes.DATE,
}, { sequelize, modelName: 'CakeDesignRequest', tableName: 'cake_design_requests', indexes: [
  { name: 'idx_cake_design_user', fields: ['user_id', 'created_at'] },
] });

export class CakeDesignReference extends Model<InferAttributes<CakeDesignReference>, InferCreationAttributes<CakeDesignReference>> {
  declare id: CreationOptional<number>;
  declare requestId: number;
  declare sortOrder: number;
  declare mime: string;
  declare bytes: Buffer;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

CakeDesignReference.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  requestId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  sortOrder: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
  mime: { type: DataTypes.STRING(30), allowNull: false },
  bytes: { type: DataTypes.BLOB('long'), allowNull: false },
  createdAt: DataTypes.DATE, updatedAt: DataTypes.DATE,
}, { sequelize, modelName: 'CakeDesignReference', tableName: 'cake_design_references', indexes: [
  { name: 'idx_cake_design_reference_request', fields: ['request_id', 'sort_order'] },
] });

export class CakeDesignQuote extends Model<InferAttributes<CakeDesignQuote>, InferCreationAttributes<CakeDesignQuote>> {
  declare id: CreationOptional<number>;
  declare requestId: number;
  declare version: number;
  declare price: number;
  declare materialExtrasJson: CreationOptional<Array<{ inventoryItemId: number; quantity: number }>>;
  declare allergenCodesJson: CreationOptional<string[] | null>;
  declare estimatedLaborCost: CreationOptional<number>;
  declare estimatedPackagingCost: CreationOptional<number>;
  declare effortJson: CakeEffort;
  declare proposedAt: Date;
  declare expiresAt: Date;
  declare terms: string;
  declare status: CreationOptional<'PROPOSED' | 'ACCEPTED' | 'SUPERSEDED' | 'EXPIRED'>;
  declare createdBy: number;
  declare acceptedAt: CreationOptional<Date | null>;
  declare orderId: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
CakeDesignQuote.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  requestId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  materialExtrasJson: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  allergenCodesJson: { type: DataTypes.JSON, allowNull: true },
  estimatedLaborCost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  estimatedPackagingCost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  effortJson: { type: DataTypes.JSON, allowNull: false },
  proposedAt: { type: DataTypes.DATE, allowNull: false },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  terms: { type: DataTypes.TEXT, allowNull: false },
  status: { type: DataTypes.ENUM('PROPOSED', 'ACCEPTED', 'SUPERSEDED', 'EXPIRED'), allowNull: false, defaultValue: 'PROPOSED' },
  createdBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  acceptedAt: { type: DataTypes.DATE, allowNull: true },
  orderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  createdAt: DataTypes.DATE, updatedAt: DataTypes.DATE,
}, { sequelize, modelName: 'CakeDesignQuote', tableName: 'cake_design_quotes', indexes: [
  { name: 'uq_cake_quote_version', unique: true, fields: ['request_id', 'version'] },
] });
