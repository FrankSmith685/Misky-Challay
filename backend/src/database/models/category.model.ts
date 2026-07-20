import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/** Tabla `categories`: agrupa productos en el menu (jerarquia opcional con parentId). */
export class Category extends Model<InferAttributes<Category>, InferCreationAttributes<Category>> {
  declare id: CreationOptional<number>;
  declare parentId: CreationOptional<number | null>;
  declare name: string;
  declare slug: string;
  declare description: CreationOptional<string | null>;
  declare imageUrl: CreationOptional<string | null>;
  declare sortOrder: CreationOptional<number>;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date | null>;
}

Category.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    parentId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    name: { type: DataTypes.STRING(80), allowNull: false },
    slug: { type: DataTypes.STRING(80), allowNull: false },
    description: { type: DataTypes.STRING(255), allowNull: true },
    imageUrl: { type: DataTypes.STRING(255), allowNull: true },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
    deletedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'Category',
    tableName: 'categories',
    paranoid: true,
    indexes: [{ name: 'uq_categories_slug', unique: true, fields: ['slug'] }],
  },
);

export default Category;
