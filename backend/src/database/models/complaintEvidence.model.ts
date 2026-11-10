import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../connection';

export class ComplaintEvidence extends Model<InferAttributes<ComplaintEvidence>, InferCreationAttributes<ComplaintEvidence>> {
  declare id: CreationOptional<number>;
  declare complaintId: number;
  declare fileName: string;
  declare fileUrl: string;
  declare mimeType: CreationOptional<string | null>;
  declare uploadedBy: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

ComplaintEvidence.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  complaintId: { field: 'complaint_id', type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  fileName: { field: 'file_name', type: DataTypes.STRING(180), allowNull: false },
  fileUrl: { field: 'file_url', type: DataTypes.STRING(500), allowNull: false },
  mimeType: { field: 'mime_type', type: DataTypes.STRING(100), allowNull: true },
  uploadedBy: { field: 'uploaded_by', type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  createdAt: { field: 'created_at', type: DataTypes.DATE },
  updatedAt: { field: 'updated_at', type: DataTypes.DATE },
}, { sequelize, modelName: 'ComplaintEvidence', tableName: 'complaint_evidences', indexes: [{ name: 'idx_complaint_evidences_complaint', fields: ['complaint_id', 'created_at'] }] });

export default ComplaintEvidence;
