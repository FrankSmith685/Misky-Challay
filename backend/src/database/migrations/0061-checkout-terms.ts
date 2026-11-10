import { DataTypes, QueryTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { businessInfo } from '../../config/business';
import { defaultCheckoutTerms } from '../../modules/settings/checkoutTerms.defaults';
import type { EditableBusinessInfo } from '../../modules/settings/settings.service';

export const up = async ({ context: q }: MigrationParams<QueryInterface>) => {
  const tables = await q.showAllTables() as string[];
  if (!tables.includes('checkout_terms')) await q.createTable('checkout_terms', {
    id: { type: DataTypes.TINYINT.UNSIGNED, primaryKey: true, defaultValue: 1 },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    title: { type: DataTypes.STRING(160), allowNull: false },
    content: { type: DataTypes.TEXT('medium'), allowNull: false },
    acceptance_label: { type: DataTypes.STRING(300), allowNull: false },
    updated_by: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  const existing = await q.sequelize.query('SELECT id FROM checkout_terms WHERE id=1', { type: QueryTypes.SELECT });
  if (!existing.length) {
    const rows = await q.sequelize.query<Record<string, unknown>>('SELECT * FROM business_settings WHERE id=1', { type: QueryTypes.SELECT });
    const row = rows[0];
    const business: EditableBusinessInfo = row ? {
      legalName: String(row.legal_name), commercialName: String(row.commercial_name), ruc: String(row.ruc),
      address: String(row.address), phone: String(row.phone), email: String(row.email),
      supportEmail: String(row.support_email), complaintResponseDays: Number(row.complaint_response_days),
      timeZone: String(row.time_zone ?? businessInfo.timeZone), currency: String(row.currency ?? businessInfo.currency),
      taxRate: Number(row.tax_rate ?? businessInfo.taxRate),
      platformCommissionRate: Number(row.platform_commission_rate ?? businessInfo.platformCommissionRate),
    } : businessInfo;
    const { acceptanceLabel, ...terms } = defaultCheckoutTerms(business);
    await q.bulkInsert('checkout_terms', [{ id: 1, ...terms, acceptance_label: acceptanceLabel, updated_by: null, created_at: new Date(), updated_at: new Date() }]);
  }
  const columns = await q.describeTable('orders');
  if (!columns.terms_acceptance_json) await q.addColumn('orders', 'terms_acceptance_json', { type: DataTypes.JSON, allowNull: true });
};
