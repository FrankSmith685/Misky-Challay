import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/**
 * Tabla `audit_logs` (RN-021).
 * Quien cambio que, cuando, desde donde y con que valores antes/despues.
 * Se escribe en cambios sensibles: precios, promociones, estados, stock, reembolsos.
 */
export class AuditLog extends Model<InferAttributes<AuditLog>, InferCreationAttributes<AuditLog>> {
  declare id: CreationOptional<number>;
  declare actorId: CreationOptional<number | null>;
  declare action: string;
  declare entity: string;
  declare entityId: CreationOptional<string | null>;
  declare beforeJson: CreationOptional<Record<string, unknown> | null>;
  declare afterJson: CreationOptional<Record<string, unknown> | null>;
  declare ip: CreationOptional<string | null>;
  declare userAgent: CreationOptional<string | null>;
  declare correlationId: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

AuditLog.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    actorId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    action: { type: DataTypes.STRING(60), allowNull: false },
    entity: { type: DataTypes.STRING(60), allowNull: false },
    entityId: { type: DataTypes.STRING(40), allowNull: true },
    beforeJson: { type: DataTypes.JSON, allowNull: true },
    afterJson: { type: DataTypes.JSON, allowNull: true },
    ip: { type: DataTypes.STRING(60), allowNull: true },
    userAgent: { type: DataTypes.STRING(255), allowNull: true },
    correlationId: { type: DataTypes.STRING(60), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'AuditLog',
    tableName: 'audit_logs',
    indexes: [
      { name: 'idx_audit_entity', fields: ['entity', 'entity_id'] },
      { name: 'idx_audit_actor', fields: ['actor_id'] },
    ],
  },
);

export default AuditLog;
