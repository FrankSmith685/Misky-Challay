import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';

const EVENT_TYPES = [
  'COVERAGE_SUCCESS', 'COVERAGE_FAIL', 'COVERAGE_ERROR', 'CHECKOUT_START',
  'CHECKOUT_ERROR', 'PAYMENT_REDIRECT', 'APP_OPEN', 'MENU_VIEW', 'PRODUCT_VIEW',
  'FAVORITE_ADD', 'FAVORITE_REMOVE', 'CART_ADD', 'CHECKOUT_STEP', 'ORDER_COMPLETED',
  'REVIEW_SUBMITTED', 'RECOMMENDATION_OPEN', 'AR_QR_OPEN', 'AR_CAMERA_REQUEST',
  'AR_CAMERA_READY', 'AR_TARGET_FOUND', 'AR_TARGET_LOST', 'AR_CAMERA_ERROR',
  'AR_FALLBACK_3D',
] as const;

/** Amplía la medición anónima para poder detectar dónde se atasca el recorrido AR. */
export const up = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  await q.changeColumn('ux_events', 'event_type', {
    type: DataTypes.ENUM(...EVENT_TYPES),
    allowNull: false,
  });
};

export const down = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  await q.changeColumn('ux_events', 'event_type', {
    type: DataTypes.ENUM(
      'COVERAGE_SUCCESS', 'COVERAGE_FAIL', 'COVERAGE_ERROR', 'CHECKOUT_START',
      'CHECKOUT_ERROR', 'PAYMENT_REDIRECT', 'APP_OPEN', 'MENU_VIEW', 'PRODUCT_VIEW',
      'FAVORITE_ADD', 'FAVORITE_REMOVE', 'CART_ADD', 'CHECKOUT_STEP', 'ORDER_COMPLETED',
      'REVIEW_SUBMITTED', 'RECOMMENDATION_OPEN',
    ),
    allowNull: false,
  });
};
