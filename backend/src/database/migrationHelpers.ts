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

export const tableExists = async (context: QueryInterface, table: string): Promise<boolean> => {
  const tables = await context.showAllTables();
  return tables.some((entry) => {
    if (typeof entry === 'string') return entry === table;
    const value = entry as unknown as { tableName?: string; table_name?: string };
    return value.tableName === table || value.table_name === table;
  });
};

export const addIndexIfMissing = async (
  context: QueryInterface,
  table: string,
  fields: string[],
  options: { name: string; unique?: boolean },
): Promise<void> => {
  const indexes = await context.showIndex(table) as unknown as Array<{ name?: string }>;
  if (indexes.some((index) => index.name === options.name)) {
    logger.warn(`El indice ${options.name} ya existia: se omite (sync lo creo antes)`);
    return;
  }
  await context.addIndex(table, fields, options);
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
