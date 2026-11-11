import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../connection';

export const UX_EVENT_TYPES = [
  'COVERAGE_SUCCESS', 'COVERAGE_FAIL', 'COVERAGE_ERROR', 'CHECKOUT_START',
  'CHECKOUT_ERROR', 'PAYMENT_REDIRECT', 'APP_OPEN', 'MENU_VIEW', 'PRODUCT_VIEW',
  'FAVORITE_ADD', 'FAVORITE_REMOVE', 'CART_ADD', 'CHECKOUT_STEP', 'ORDER_COMPLETED',
  'REVIEW_SUBMITTED', 'RECOMMENDATION_OPEN', 'AR_QR_OPEN', 'AR_CAMERA_REQUEST',
  'AR_CAMERA_READY', 'AR_TARGET_FOUND', 'AR_TARGET_LOST', 'AR_CAMERA_ERROR',
  'AR_FALLBACK_3D', 'VIDEO_QR_OPEN', 'VIDEO_PLAY', 'VIDEO_PROGRESS', 'VIDEO_COMPLETE',
  'VIDEO_SHARE', 'VIDEO_ERROR',
] as const;
export type UxEventType = (typeof UX_EVENT_TYPES)[number];

export class UxEvent extends Model<InferAttributes<UxEvent>, InferCreationAttributes<UxEvent>> {
  declare id: CreationOptional<number>;
  declare sessionId: string;
  declare userId: CreationOptional<number | null>;
  declare eventType: UxEventType;
  /**
   * Cocina a la que pertenece el evento. NULO cuando no se pudo atribuir: el
   * comprobador de cobertura corre antes de saber que sucursal atiende.
   *
   * El Resumen filtraba estas metricas SOLO por fecha mientras su cabecera decia
   * "en la cocina seleccionada", asi que el mismo numero se pintaba bajo dos
   * sucursales distintas. Es una columna y no `metadata.branchId` porque el
   * reporte agrupa por ella en cada carga y un JSON_EXTRACT no usa indice.
   */
  declare branchId: CreationOptional<number | null>;
  declare metadata: CreationOptional<Record<string, unknown> | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

UxEvent.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  sessionId: { type: DataTypes.STRING(64), allowNull: false },
  userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  eventType: { type: DataTypes.ENUM(...UX_EVENT_TYPES), allowNull: false },
  branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  metadata: { type: DataTypes.JSON, allowNull: true },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE,
}, { sequelize, modelName: 'UxEvent', tableName: 'ux_events', indexes: [{ fields: ['event_type', 'created_at'] }, { fields: ['session_id'] }, { fields: ['branch_id', 'created_at'] }] });

export default UxEvent;
