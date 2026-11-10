import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model, NonAttribute } from 'sequelize';
import { sequelize } from '../connection';
import type { TeamAssignment } from './teamAssignment.model';

/** Estación operativa configurable; no sustituye a roles ni permisos. */
export class Team extends Model<InferAttributes<Team>, InferCreationAttributes<Team>> {
  declare id: CreationOptional<number>;
  declare key: string;
  declare name: string;
  declare description: CreationOptional<string | null>;
  declare route: string;
  declare icon: CreationOptional<string | null>;
  declare roleCodes: CreationOptional<string[]>;
  declare branchRequired: CreationOptional<boolean>;
  declare minimumPerBranch: CreationOptional<number>;
  declare isActive: CreationOptional<boolean>;
  declare sortOrder: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date | null>;
  declare assignments?: NonAttribute<TeamAssignment[]>;
}

Team.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    key: { field: 'team_key', type: DataTypes.STRING(50), allowNull: false },
    name: { type: DataTypes.STRING(100), allowNull: false },
    description: { type: DataTypes.STRING(255), allowNull: true },
    route: { type: DataTypes.STRING(120), allowNull: false },
    icon: { type: DataTypes.STRING(40), allowNull: true },
    roleCodes: { field: 'role_codes_json', type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    branchRequired: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    minimumPerBranch: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
    deletedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'Team',
    tableName: 'teams',
    paranoid: true,
    indexes: [
      { name: 'uq_teams_key', unique: true, fields: ['key'] },
      { name: 'idx_teams_active_order', fields: ['is_active', 'sort_order'] },
    ],
  },
);

export default Team;
