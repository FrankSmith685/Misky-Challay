import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../connection';

/** Producto guardado por un cliente. Vive en servidor para acompañarlo en cualquier dispositivo. */
export class ProductFavorite extends Model<InferAttributes<ProductFavorite>, InferCreationAttributes<ProductFavorite>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare productId: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

ProductFavorite.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  productId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE,
}, {
  sequelize,
  modelName: 'ProductFavorite',
  tableName: 'product_favorites',
  indexes: [{ name: 'uq_product_favorites_user_product', unique: true, fields: ['user_id', 'product_id'] }],
});

export default ProductFavorite;
