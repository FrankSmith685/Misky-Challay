import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../connection';
import type { CakeEffort } from './cakeProduction.model';

export interface ThemeMaterial { inventoryItemId: number; quantity: number }
export interface CakeThemeRule {
  variantId: number;
  priceDelta: number;
  materials: ThemeMaterial[];
  effort: CakeEffort;
  excludedOptionIds: number[];
  /** Groups already resolved by the design and its own materials. */
  hiddenGroupIds?: number[];
}
export interface CakeThemeSnapshot {
  id: number;
  version: number;
  name: string;
  slug: string;
  theme: string;
  imageUrl: string | null;
  priceDelta: number;
  materials: ThemeMaterial[];
  effort: CakeEffort;
  allergens: string[];
}

/** Modelos visuales vinculados a una receta base; no duplican productos ni stock. */
export class CakeTheme extends Model<InferAttributes<CakeTheme>, InferCreationAttributes<CakeTheme>> {
  declare id: CreationOptional<number>;
  declare productId: number;
  declare name: string;
  declare slug: string;
  declare theme: string;
  declare description: string;
  declare imageUrlsJson: string[];
  declare saleMode: 'CONFIGURED' | 'QUOTE';
  declare minLeadHours: number;
  declare minServings: number;
  declare maxServings: number;
  declare variantRulesJson: CakeThemeRule[];
  declare isActive: CreationOptional<boolean>;
  declare sortOrder: CreationOptional<number>;
  declare version: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
CakeTheme.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  productId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  name: { type: DataTypes.STRING(120), allowNull: false },
  slug: { type: DataTypes.STRING(150), unique: true, allowNull: false },
  theme: { type: DataTypes.STRING(80), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: false },
  imageUrlsJson: { type: DataTypes.JSON, allowNull: false },
  saleMode: { type: DataTypes.ENUM('CONFIGURED', 'QUOTE'), allowNull: false },
  minLeadHours: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  minServings: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  maxServings: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  variantRulesJson: { type: DataTypes.JSON, allowNull: false },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
  sortOrder: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 0, allowNull: false },
  version: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 1, allowNull: false },
  createdAt: DataTypes.DATE, updatedAt: DataTypes.DATE,
}, { sequelize, modelName: 'CakeTheme', tableName: 'cake_themes' });
