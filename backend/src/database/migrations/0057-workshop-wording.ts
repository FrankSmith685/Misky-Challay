import type { QueryInterface } from 'sequelize';
import { QueryTypes } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { workshopContent, workshopWording } from '../../shared/utils/workshopWording';

export const up = async ({ context: q }: MigrationParams<QueryInterface>) => {
  await q.sequelize.transaction(async (transaction) => {
    for (const table of ['storefront_settings', 'messaging_settings'] as const) {
      if (!(await q.tableExists(table))) continue;
      const column = table === 'storefront_settings' ? 'content_json' : 'config';
      const rows = await q.sequelize.query<{ id: number; document: unknown }>(
        `SELECT id, \`${column}\` AS document FROM \`${table}\` WHERE id=1 FOR UPDATE`,
        { type: QueryTypes.SELECT, transaction },
      );
      for (const row of rows) {
        const document = typeof row.document === 'string' ? JSON.parse(row.document) : row.document;
        const next = workshopContent(document);
        if (JSON.stringify(next) === JSON.stringify(document)) continue;
        await q.sequelize.query(
          `UPDATE \`${table}\` SET \`${column}\`=:document, updated_at=NOW()${table === 'storefront_settings' ? ', version=version+1' : ''} WHERE id=:id`,
          { replacements: { document: JSON.stringify(next), id: row.id }, transaction },
        );
      }
    }
    if (await q.tableExists('local_payment_settings')) {
      const rows = await q.sequelize.query<{ id: number; instructions: string | null }>(
        'SELECT id, instructions FROM local_payment_settings WHERE id=1 FOR UPDATE',
        { type: QueryTypes.SELECT, transaction },
      );
      for (const row of rows) {
        if (!row.instructions) continue;
        const next = workshopWording(row.instructions);
        if (next !== row.instructions)
          await q.sequelize.query(
            'UPDATE local_payment_settings SET instructions=:instructions, updated_at=NOW() WHERE id=:id',
            { replacements: { instructions: next, id: row.id }, transaction },
          );
      }
    }
  });
};
