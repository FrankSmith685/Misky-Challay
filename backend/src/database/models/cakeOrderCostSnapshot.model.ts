import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../connection';

export interface CakeMaterialEstimate { itemId: number; quantity: number; unitCost: number | null; source: 'LOT' | 'AVERAGE' | 'ITEM' | 'MISSING' }

/** Fotografia de cantidades y costos conocidos al confirmar el precio de venta. */
export class CakeOrderCostSnapshot extends Model<InferAttributes<CakeOrderCostSnapshot>, InferCreationAttributes<CakeOrderCostSnapshot>> {
  declare orderId: number;
  declare estimatedMaterialCost: number;
  declare estimatedLaborCost: CreationOptional<number>;
  declare estimatedPackagingCost: CreationOptional<number>;
  declare costsComplete: boolean;
  declare materialsJson: CakeMaterialEstimate[];
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
CakeOrderCostSnapshot.init({
  orderId: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true },
  estimatedMaterialCost: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  estimatedLaborCost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  estimatedPackagingCost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  costsComplete: { type: DataTypes.BOOLEAN, allowNull: false },
  materialsJson: { type: DataTypes.JSON, allowNull: false },
  createdAt: DataTypes.DATE, updatedAt: DataTypes.DATE,
}, { sequelize, modelName: 'CakeOrderCostSnapshot', tableName: 'cake_order_cost_snapshots' });
