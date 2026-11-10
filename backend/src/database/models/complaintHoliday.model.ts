import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../connection';

export class ComplaintHoliday extends Model<InferAttributes<ComplaintHoliday>, InferCreationAttributes<ComplaintHoliday>> {
  declare id: CreationOptional<number>;
  declare holidayDate: string;
  declare label: string;
  declare isActive: CreationOptional<boolean>;
  declare createdBy: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

ComplaintHoliday.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  holidayDate: { field: 'holiday_date', type: DataTypes.DATEONLY, allowNull: false },
  label: { type: DataTypes.STRING(120), allowNull: false },
  isActive: { field: 'is_active', type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  createdBy: { field: 'created_by', type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  createdAt: { field: 'created_at', type: DataTypes.DATE },
  updatedAt: { field: 'updated_at', type: DataTypes.DATE },
}, { sequelize, modelName: 'ComplaintHoliday', tableName: 'complaint_holidays', indexes: [{ name: 'uq_complaint_holidays_date', unique: true, fields: ['holiday_date'] }] });

export default ComplaintHoliday;
