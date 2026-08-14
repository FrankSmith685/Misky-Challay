import type { QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';

/**
 * Normaliza `users.phone` a solo digitos.
 *
 * La columna tiene indice UNICO, pero se guardaba el texto tal y como lo escribia
 * el cliente. Para MySQL "926 749 330" y "926749330" son valores distintos, asi
 * que el indice no impedia registrar dos veces la misma linea: solo saltaba
 * cuando ademas coincidia el formato. A partir de aqui el codigo normaliza antes
 * de guardar (shared/utils/phone.ts) y esta migracion pone al dia lo existente.
 */

/** Quita espacios, guiones y parentesis. El "+" se conserva. */
const NORMALIZED = `REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', '')`;

export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  /*
   * Antes de tocar una sola fila: si dos cuentas distintas normalizan al mismo
   * numero, el UPDATE chocaria contra uq_users_phone a medio camino y dejaria la
   * tabla a medias. Se detecta primero y se aborta nombrando los ids, que es un
   * conflicto de datos reales y lo tiene que resolver una persona.
   *
   * Se miran TODAS las filas, incluidas las de borrado logico: el indice unico
   * tambien las cuenta.
   */
  const [collisions] = (await context.sequelize.query(`
    SELECT ${NORMALIZED} AS normalizado, GROUP_CONCAT(id ORDER BY id) AS ids, COUNT(*) AS total
      FROM users
     WHERE phone IS NOT NULL AND phone <> ''
     GROUP BY normalizado
    HAVING COUNT(*) > 1
  `)) as [Array<{ normalizado: string; ids: string; total: number }>, unknown];

  if (collisions.length > 0) {
    const detail = collisions
      .map((row) => `${row.normalizado} -> usuarios ${row.ids}`)
      .join('; ');
    throw new Error(
      'No se puede normalizar: hay telefonos que quedarian duplicados. ' +
        `Corrige o vacia el telefono de una de cada pareja y vuelve a ejecutar. Conflictos: ${detail}`,
    );
  }

  await context.sequelize.query(`
    UPDATE users
       SET phone = ${NORMALIZED}
     WHERE phone IS NOT NULL AND phone <> '' AND phone <> ${NORMALIZED}
  `);
};

/**
 * Irreversible a proposito: el formato original (que espacios y guiones puso cada
 * cliente) no se guarda en ningun sitio, asi que no hay nada que restaurar. Los
 * numeros normalizados siguen siendo validos, de modo que revertir la migracion
 * anterior no requiere deshacer esto.
 */
export const down = async (): Promise<void> => {
  // Sin accion.
};
