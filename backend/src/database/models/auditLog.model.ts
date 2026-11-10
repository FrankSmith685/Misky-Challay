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
  declare severity: CreationOptional<'INFO' | 'WARNING' | 'CRITICAL'>;
  declare outcome: CreationOptional<'SUCCESS' | 'FAILURE'>;
  declare method: CreationOptional<string | null>;
  declare path: CreationOptional<string | null>;
  declare sessionId: CreationOptional<string | null>;
  declare eventVersion: CreationOptional<number>;
  declare previousHash: CreationOptional<string | null>;
  declare integrityHash: CreationOptional<string>;
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
    severity: { type: DataTypes.ENUM('INFO', 'WARNING', 'CRITICAL'), allowNull: false, defaultValue: 'INFO' },
    outcome: { type: DataTypes.ENUM('SUCCESS', 'FAILURE'), allowNull: false, defaultValue: 'SUCCESS' },
    method: { type: DataTypes.STRING(10), allowNull: true },
    path: { type: DataTypes.STRING(255), allowNull: true },
    sessionId: { field: 'session_id', type: DataTypes.STRING(100), allowNull: true },
    eventVersion: { field: 'event_version', type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    previousHash: { field: 'previous_hash', type: DataTypes.STRING(64), allowNull: true },
    integrityHash: { field: 'integrity_hash', type: DataTypes.STRING(64), allowNull: false },
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
      { name: 'idx_audit_filters', fields: ['created_at', 'severity', 'outcome', 'action'] },
      { name: 'idx_audit_correlation', fields: ['correlation_id'] },
    ],
  },
);

export default AuditLog;
