import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../connection';
import type { ThemeTokens } from '@config/theme';

/** Tema global del producto. Se edita como borrador y se publica de forma explícita. */
export class ThemeSetting extends Model<InferAttributes<ThemeSetting>, InferCreationAttributes<ThemeSetting>> {
  declare id: CreationOptional<number>;
  declare draftTokensJson: ThemeTokens;
  declare publishedTokensJson: ThemeTokens;
  declare draftVersion: number;
  declare publishedVersion: number;
  declare updatedBy: CreationOptional<number | null>;
  declare publishedBy: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

ThemeSetting.init({
  id: { type: DataTypes.TINYINT.UNSIGNED, primaryKey: true, defaultValue: 1 },
  draftTokensJson: { field: 'draft_tokens_json', type: DataTypes.JSON, allowNull: false },
  publishedTokensJson: { field: 'published_tokens_json', type: DataTypes.JSON, allowNull: false },
  draftVersion: { field: 'draft_version', type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
  publishedVersion: { field: 'published_version', type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
  updatedBy: { field: 'updated_by', type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  publishedBy: { field: 'published_by', type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  createdAt: { field: 'created_at', type: DataTypes.DATE },
  updatedAt: { field: 'updated_at', type: DataTypes.DATE },
}, { sequelize, modelName: 'ThemeSetting', tableName: 'theme_settings' });

export default ThemeSetting;
