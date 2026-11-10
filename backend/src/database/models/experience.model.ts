import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';
import type {
  ExperienceScene,
  ExperienceStatus,
  PackageSnapshot,
} from '@modules/experiences/experience.logic';

export class ExperienceTemplate extends Model<
  InferAttributes<ExperienceTemplate>,
  InferCreationAttributes<ExperienceTemplate>
> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare sceneJson: ExperienceScene;
  declare isActive: CreationOptional<boolean>;
  declare version: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
ExperienceTemplate.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    sceneJson: { type: DataTypes.JSON, allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    version: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 1 },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'experience_templates', modelName: 'ExperienceTemplate' },
);

export class ExperiencePackage extends Model<
  InferAttributes<ExperiencePackage>,
  InferCreationAttributes<ExperiencePackage>
> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare description: string;
  declare mode: 'VIDEO' | 'AR';
  declare price: number;
  declare validityDays: number;
  declare revisionsIncluded: number;
  declare minLeadHours: number;
  declare paymentRequirement: 'FULL' | 'DEPOSIT';
  declare templateId: number | null;
  declare isActive: boolean;
  declare version: CreationOptional<number>;
  declare sortOrder: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
ExperiencePackage.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    description: { type: DataTypes.STRING(600), allowNull: false },
    mode: { type: DataTypes.STRING(10), allowNull: false },
    price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    validityDays: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    revisionsIncluded: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    minLeadHours: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    paymentRequirement: { type: DataTypes.STRING(10), allowNull: false },
    templateId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    version: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 1 },
    sortOrder: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 0 },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'experience_packages', modelName: 'ExperiencePackage' },
);

export class ExperienceAsset extends Model<
  InferAttributes<ExperienceAsset>,
  InferCreationAttributes<ExperienceAsset>
> {
  declare id: CreationOptional<number>;
  declare projectId: number | null;
  declare kind: 'VIDEO' | 'MODEL' | 'AUDIO' | 'IMAGE' | 'TARGET';
  declare mime: string;
  declare name: string;
  declare sourceImageId: number | null;
  declare bytes: Buffer;
  declare size: number;
  declare sha256: string;
  declare createdBy: number | null;
  declare createdAt: CreationOptional<Date>;
}
ExperienceAsset.init(
  {
    projectId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    kind: { type: DataTypes.STRING(10), allowNull: false },
    mime: { type: DataTypes.STRING(80), allowNull: false },
    name: { type: DataTypes.STRING(150), allowNull: false },
    sourceImageId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    bytes: { type: DataTypes.BLOB('long'), allowNull: false },
    size: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    sha256: { type: DataTypes.STRING(64), allowNull: false },
    createdBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'experience_assets', modelName: 'ExperienceAsset', updatedAt: false },
);

export class ExperienceProject extends Model<
  InferAttributes<ExperienceProject>,
  InferCreationAttributes<ExperienceProject>
> {
  declare id: CreationOptional<number>;
  declare orderId: number;
  declare packageSnapshotJson: PackageSnapshot;
  declare sceneJson: ExperienceScene;
  declare publishedSceneJson: ExperienceScene | null;
  declare brief: string;
  declare status: CreationOptional<ExperienceStatus>;
  declare version: CreationOptional<number>;
  declare approvedVersion: number | null;
  declare publicToken: string;
  declare previewToken: string | null;
  declare previewExpiresAt: Date | null;
  declare startsAt: Date | null;
  declare expiresAt: Date | null;
  declare draftSceneJson: CreationOptional<ExperienceScene | null>;
  declare draftAssignedTo: CreationOptional<number | null>;
  declare draftUpdatedAt: CreationOptional<Date | null>;
  declare assignedTo: number | null;
  declare revisionsUsed: CreationOptional<number>;
  declare customerFeedback: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
ExperienceProject.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    orderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, unique: true },
    packageSnapshotJson: { type: DataTypes.JSON, allowNull: false },
    sceneJson: { type: DataTypes.JSON, allowNull: false },
    publishedSceneJson: { type: DataTypes.JSON, allowNull: true },
    brief: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.STRING(30), defaultValue: 'DRAFT', allowNull: false },
    version: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 1 },
    approvedVersion: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    publicToken: { type: DataTypes.STRING(48), allowNull: false, unique: true },
    previewToken: { type: DataTypes.STRING(48), allowNull: true, unique: true },
    previewExpiresAt: { type: DataTypes.DATE, allowNull: true },
    startsAt: { type: DataTypes.DATE, allowNull: true },
    expiresAt: { type: DataTypes.DATE, allowNull: true },
    draftSceneJson: { type: DataTypes.JSON, allowNull: true },
    draftAssignedTo: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    draftUpdatedAt: { type: DataTypes.DATE, allowNull: true },
    assignedTo: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    revisionsUsed: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 0 },
    customerFeedback: { type: DataTypes.STRING(1000), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'experience_projects', modelName: 'ExperienceProject' },
);

export class ExperienceEvent extends Model<
  InferAttributes<ExperienceEvent>,
  InferCreationAttributes<ExperienceEvent>
> {
  declare id: CreationOptional<number>;
  declare projectId: number;
  declare actorId: number | null;
  declare action: string;
  declare version: number;
  declare note: string;
  declare snapshotJson: CreationOptional<ExperienceScene | null>;
  declare assignedToSnapshot: CreationOptional<number | null>;
  declare requestKey: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
}
ExperienceEvent.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    projectId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    actorId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    action: { type: DataTypes.STRING(40), allowNull: false },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    note: { type: DataTypes.STRING(1000), allowNull: false },
    snapshotJson: { type: DataTypes.JSON, allowNull: true },
    assignedToSnapshot: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    requestKey: { type: DataTypes.STRING(160), allowNull: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'experience_events', modelName: 'ExperienceEvent', updatedAt: false },
);
