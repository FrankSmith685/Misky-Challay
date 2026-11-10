import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../connection';

export class ComplaintNote extends Model<InferAttributes<ComplaintNote>, InferCreationAttributes<ComplaintNote>> {
  declare id: CreationOptional<number>;
  declare complaintId: number;
  declare authorId: CreationOptional<number | null>;
  declare note: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

ComplaintNote.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  complaintId: { field: 'complaint_id', type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  authorId: { field: 'author_id', type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  note: { type: DataTypes.TEXT, allowNull: false },
  createdAt: { field: 'created_at', type: DataTypes.DATE },
  updatedAt: { field: 'updated_at', type: DataTypes.DATE },
}, { sequelize, modelName: 'ComplaintNote', tableName: 'complaint_notes', indexes: [{ name: 'idx_complaint_notes_complaint', fields: ['complaint_id', 'created_at'] }] });

export default ComplaintNote;
