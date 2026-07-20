import type { QueryInterface, ModelAttributeColumnOptions } from 'sequelize';
import { logger } from '@config/logger';

/**
 * AYUDAS PARA ESCRIBIR MIGRACIONES
 * ---------------------------------------------------------------------------
 * Vive fuera de `migrations/` a proposito: el glob del migrador trata cualquier .ts
 * de esa carpeta como una migracion.
 *
 * Por que hacen falta: en desarrollo el esquema se crea desde los modelos con
 * `sync({ alter: true })`, asi que al tocar un modelo la columna aparece sola en tu
 * base local. Cuando despues escribes la migracion y la ejecutas, MySQL responde
 * "Duplicate column name" aunque la migracion sea correcta. Estas ayudas la dejan
 * pasar avisando, en vez de fallar.
 *
 * En produccion nunca se saltan nada: alli el esquema solo cambia por migraciones,
 * asi que la columna no puede existir de antemano. Si el aviso aparece en produccion,
 * es senal de que alguien aplico un cambio a mano.
 */

const columnExists = async (
  context: QueryInterface,
  table: string,
  column: string,
): Promise<boolean> => {
  const description = await context.describeTable(table);
  return Object.prototype.hasOwnProperty.call(description, column);
};

export const addColumnIfMissing = async (
  context: QueryInterface,
  table: string,
  column: string,
  definition: ModelAttributeColumnOptions,
): Promise<void> => {
  if (await columnExists(context, table, column)) {
    logger.warn(`La columna ${table}.${column} ya existia: se omite (sync la creo antes)`);
    return;
  }

  await context.addColumn(table, column, definition);
};

export const removeColumnIfPresent = async (
  context: QueryInterface,
  table: string,
  column: string,
): Promise<void> => {
  if (!(await columnExists(context, table, column))) {
    logger.warn(`La columna ${table}.${column} no existe: se omite al revertir`);
    return;
  }

  await context.removeColumn(table, column);
};
