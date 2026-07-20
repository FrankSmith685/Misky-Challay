# Migraciones

El esquema de **producción** se construye aplicando estos archivos, uno a uno y en orden.
Nunca con `sequelize.sync()`: sync no deja historial de lo aplicado, no se puede revertir
y `alter: true` decide por su cuenta cómo transformar una columna —incluido truncar datos—
sin preguntar.

## Cómo trabajas en desarrollo

Sigues igual que hasta ahora. `DB_SYNC=true` y `DB_ALTER=true` en tu `.env`: tocas un
modelo, reinicias y la tabla se ajusta sola. Rápido, sin escribir migraciones para cada
prueba.

Cuando el cambio ya está decidido y va a subir, escribes su migración:

```bash
npm run db:migrate:create --workspace backend -- --name agrega-telefono-a-drivers
```

Eso crea `NNNN-agrega-telefono-a-drivers.ts`. Dentro tienes el `queryInterface` de
Sequelize:

```ts
import type { MigrationParams } from 'umzug';
import type { QueryInterface } from 'sequelize';
import { DataTypes } from 'sequelize';

export const up = async ({ context }: MigrationParams<QueryInterface>) => {
  await context.addColumn('drivers', 'phone', { type: DataTypes.STRING(30), allowNull: true });
};

export const down = async ({ context }: MigrationParams<QueryInterface>) => {
  await context.removeColumn('drivers', 'phone');
};
```

Escribe siempre el `down`. El día que una migración salga mal en producción, es lo único
que hay entre tú y restaurar un backup.

## El chequeo de deriva

Que el modelo y la migración digan lo mismo no lo garantiza nadie: puedes cambiar el
modelo y olvidar la migración, y el fallo aparecería en producción.

```bash
npm run db:check-drift --workspace backend
```

Levanta **dos** bases temporales —una aplicando las migraciones, otra con `sync()` desde
los modelos—, vuelca ambos esquemas y los compara. Si difieren, te dice qué columna o
índice falta y en qué lado está. Corre solo en cada push (job `esquema` de CI), así que
la deriva se descubre en el pull request.

Con `--keep` conserva las dos bases para inspeccionarlas a mano.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run db:migrate` | Aplica lo pendiente |
| `npm run db:migrate:status` | Qué falta por aplicar |
| `npm run db:migrate:applied` | Qué se aplicó ya, y cuándo |
| `npm run db:migrate:undo` | Revierte la última |
| `npm run db:migrate:create -- --name algo` | Crea el archivo |
| `npm run db:check-drift` | Migraciones contra modelos |

Todos con `--workspace backend` desde la raíz.

## Reglas

**El baseline no se toca.** `0001-baseline.sql` es el esquema congelado el día que se
adoptaron migraciones (63 tablas, 92 claves foráneas). Cualquier cambio posterior va en un
archivo nuevo, aunque parezca más limpio editarlo.

**Se aplican en el despliegue, no en el arranque.** El servidor no migra solo al levantarse.
`npm run db:migrate` es un paso explícito antes de arrancar la versión nueva: así un fallo
de migración detiene el despliegue en lugar de dejar el servicio a medias, y dos instancias
arrancando a la vez no compiten por el mismo `ALTER`.

**Una base que ya existía se adopta sola.** Si hay tablas pero la tabla `migrations` está
vacía, el baseline se marca como aplicado sin ejecutarse (`adoptExistingSchema`). Tu base de
desarrollo actual entra por ahí; no hace falta recrearla.

**Los seeders siguen siendo otra cosa.** Las migraciones crean estructura; `npm run db:seed`
inserta permisos, roles, superadmin y UBIGEO. No mezcles datos en una migración salvo que
sean imprescindibles para que el esquema tenga sentido.

## Regenerar el baseline

Solo si estás empezando de cero y quieres recapturar el esquema:

```bash
npm run db:baseline --workspace backend
```

Vuelca la estructura de tu base local con `mysqldump --no-data`. Necesita MySQL corriendo y
`mysqldump` accesible (busca en el `PATH` y en las rutas habituales de Windows).
