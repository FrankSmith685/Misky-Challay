import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, addIndexIfMissing, removeColumnIfPresent } from '../migrationHelpers';

/**
 * Sucursal en los eventos de experiencia.
 *
 * El Resumen del panel filtraba estas metricas solo por fecha mientras su cabecera
 * decia "en la cocina seleccionada": el mismo numero se pintaba bajo dos sucursales
 * distintas. Es nula porque hay eventos que no se pueden atribuir (el comprobador
 * de cobertura corre antes de saber que cocina atiende esa direccion); esos quedan
 * fuera del informe por sucursal a proposito.
 *
 * Sin clave foranea a proposito: una fila de telemetria no debe impedir dar de baja
 * una sucursal, y perder la atribucion de un evento historico no rompe nada.
 */
export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(context, 'ux_events', 'branch_id', {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
  });

  await addIndexIfMissing(context, 'ux_events', ['branch_id', 'created_at'], {
    name: 'ux_events_branch_id_created_at',
  });
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await context.removeIndex('ux_events', 'ux_events_branch_id_created_at');
  await removeColumnIfPresent(context, 'ux_events', 'branch_id');
};
