import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../connection';
import type { CakeVisualDesign } from '../../modules/cakes/cakeVisualDesign';

export interface CakePreviewSnapshot {
  productId: number;
  productSlug: string;
  productName: string;
  variantId: number;
  variantName: string;
  servings: number | null;
  diameterCm?: number | null;
  themeName: string | null;
  themeSlug: string | null;
  options: Array<{ groupName: string; optionName: string; quantity: number }>;
  visualDesign?: CakeVisualDesign;
  referenceImageDataUrl?: string;
  configuration?: {
    selections: Array<{ optionId: number; quantity: number }>;
    requestedServings?: number;
    themeId?: number;
    themeVersion?: number;
  };
}

/** Public visual snapshot. Images require explicit opt in; no notes, prices or contact data. */
export class CakePreviewShare extends Model<InferAttributes<CakePreviewShare>, InferCreationAttributes<CakePreviewShare>> {
  declare token: string;
  declare snapshotJson: CakePreviewSnapshot;
  declare expiresAt: Date;
  declare createdAt: CreationOptional<Date>;
}

CakePreviewShare.init({
  token: { type: DataTypes.STRING(32), primaryKey: true },
  snapshotJson: { type: DataTypes.JSON, allowNull: false },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  createdAt: DataTypes.DATE,
}, { sequelize, modelName: 'CakePreviewShare', tableName: 'cake_preview_shares', timestamps: true, updatedAt: false,
  indexes: [{ name: 'idx_cake_preview_shares_expiry', fields: ['expires_at'] }],
});
