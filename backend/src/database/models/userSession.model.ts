import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../connection';

/** Sesiones de refresh para que el superadmin pueda revisar y revocar accesos. */
export class UserSession extends Model<InferAttributes<UserSession>, InferCreationAttributes<UserSession>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare tokenHash: string;
  declare createdAt: CreationOptional<Date>;
  declare lastSeenAt: CreationOptional<Date>;
  declare expiresAt: Date;
  declare revokedAt: CreationOptional<Date | null>;
  declare ip: CreationOptional<string | null>;
  declare userAgent: CreationOptional<string | null>;
  declare deviceLabel: CreationOptional<string | null>;
}

UserSession.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    tokenHash: { type: DataTypes.STRING(64), allowNull: false },
    createdAt: DataTypes.DATE,
    lastSeenAt: DataTypes.DATE,
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    revokedAt: { type: DataTypes.DATE, allowNull: true },
    ip: { type: DataTypes.STRING(64), allowNull: true },
    userAgent: { type: DataTypes.STRING(250), allowNull: true },
    deviceLabel: { type: DataTypes.STRING(120), allowNull: true },
  },
  {
    sequelize,
    modelName: 'UserSession',
    tableName: 'user_sessions',
    updatedAt: false,
    indexes: [
      { name: 'uq_user_sessions_token_hash', unique: true, fields: ['token_hash'] },
      { name: 'idx_user_sessions_user_status', fields: ['user_id', 'revoked_at', 'expires_at'] },
    ],
  },
);

export default UserSession;
