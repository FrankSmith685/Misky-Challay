import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../connection';

/** Publicación vigente. Cada pedido conserva su propia copia al aceptar. */
export class CheckoutTerms extends Model<InferAttributes<CheckoutTerms>, InferCreationAttributes<CheckoutTerms>> {
  declare id: CreationOptional<number>;
  declare version: number;
  declare title: string;
  declare content: string;
  declare acceptanceLabel: string;
  declare updatedBy: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

CheckoutTerms.init({
  id: { type: DataTypes.TINYINT.UNSIGNED, primaryKey: true, defaultValue: 1 },
  version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  title: { type: DataTypes.STRING(160), allowNull: false },
  content: { type: DataTypes.TEXT('medium'), allowNull: false },
  acceptanceLabel: { type: DataTypes.STRING(300), allowNull: false },
  updatedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE,
}, { sequelize, modelName: 'CheckoutTerms', tableName: 'checkout_terms' });
