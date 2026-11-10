import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model, NonAttribute } from 'sequelize';
import { sequelize } from '../connection';
import type { Branch } from './branch.model';
import type { Team } from './team.model';
import type { User } from './user.model';

export const TEAM_RESPONSIBILITY = { PRIMARY: 'PRIMARY', BACKUP: 'BACKUP' } as const;
export type TeamResponsibility = (typeof TEAM_RESPONSIBILITY)[keyof typeof TEAM_RESPONSIBILITY];
export const TEAM_AVAILABILITY = { AVAILABLE: 'AVAILABLE', AWAY: 'AWAY', UNAVAILABLE: 'UNAVAILABLE' } as const;
export type TeamAvailability = (typeof TEAM_AVAILABILITY)[keyof typeof TEAM_AVAILABILITY];

/** Responsable principal o reemplazo con vigencia y disponibilidad auditables. */
export class TeamAssignment extends Model<InferAttributes<TeamAssignment>, InferCreationAttributes<TeamAssignment>> {
  declare id: CreationOptional<number>;
  declare teamId: number;
  declare userId: number;
  declare branchId: CreationOptional<number | null>;
  declare responsibility: CreationOptional<TeamResponsibility>;
  declare effectiveFrom: CreationOptional<Date>;
  declare effectiveUntil: CreationOptional<Date | null>;
  declare availability: CreationOptional<TeamAvailability>;
  declare reason: CreationOptional<string | null>;
  declare createdBy: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare team?: NonAttribute<Team>;
  declare user?: NonAttribute<User>;
  declare branch?: NonAttribute<Branch | null>;
}

TeamAssignment.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    teamId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    responsibility: { type: DataTypes.ENUM(...Object.values(TEAM_RESPONSIBILITY)), allowNull: false, defaultValue: TEAM_RESPONSIBILITY.PRIMARY },
    effectiveFrom: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    effectiveUntil: { type: DataTypes.DATE, allowNull: true },
    availability: { type: DataTypes.ENUM(...Object.values(TEAM_AVAILABILITY)), allowNull: false, defaultValue: TEAM_AVAILABILITY.AVAILABLE },
    reason: { type: DataTypes.STRING(255), allowNull: true },
    createdBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'TeamAssignment',
    tableName: 'team_assignments',
    indexes: [
      { name: 'idx_team_assignments_team_branch_status', fields: ['team_id', 'branch_id', 'responsibility', 'effective_until'] },
      { name: 'idx_team_assignments_user', fields: ['user_id', 'effective_until'] },
    ],
  },
);

export default TeamAssignment;
