# Despliegue y recuperación

> **Estado:** los archivos de Docker están escritos pero **no se han construido ni
> ejecutado todavía** — no había Docker en la máquina donde se prepararon. Lo que sí
> está probado: las sondas `/live` y `/ready`, los scripts de copia y restauración
> (sintaxis), el YAML del compose, y que `backend/dist/database/migrate.js` existe
> tras compilar. La primera vez que levantes la pila, espera algún ajuste.

## Puesta en marcha

```bash
cp .env.docker.example .env      # y rellena los CAMBIAME
docker compose up -d --build
```

La web queda en `http://localhost:8080`. El backend **no** se publica: nginx le hace
de proxy por la red interna, así que el API no está expuesto a internet y no hay CORS.

Genera cada secreto con `openssl rand -base64 48`. El arranque se niega a continuar
si detecta claves de ejemplo, secretos cortos o `CORS_ORIGIN` apuntando a localhost:
está en `backend/src/config/env.ts` y son 16 comprobaciones.

## El orden importa

```
db  ──(healthy)──>  migrate  ──(completado)──>  api
                                                 ↑
                                        web ─────┘
```

`migrate` es un servicio propio que aplica las migraciones y termina. Si falla, `api`
**no arranca**: el despliegue se detiene ahí en vez de dejar el servicio en pie contra
un esquema a medias. Es la razón de que las migraciones no se apliquen en el arranque
del servidor.

## Las dos sondas

| Ruta | Pregunta | Si falla |
| --- | --- | --- |
| `/api/v1/live` | ¿el proceso responde? | reiniciar el contenedor |
| `/api/v1/ready` | ¿puede atender tráfico? | sacar del balanceador, **no** reiniciar |

`/live` no toca la base a propósito. Si un hipo de MySQL reiniciara todas las
instancias a la vez, un problema de segundos se convierte en una caída completa.

Ambas están **fuera del limitador de peticiones**. Verificado: 520 sondas seguidas no
producen ni un 429 ni consumen la cuota general. Antes de separarlas, un orquestador
sondeando cada pocos segundos desde varias instancias agotaba el límite de 500/15min,
recibía 429, lo interpretaba como "instancia enferma" y retiraba nodos sanos.

## Copias de seguridad

```bash
./scripts/backup.sh                                  # una copia comprimida
./scripts/restore.sh backups/<archivo>.sql.gz        # restaurar (pide confirmación)
./scripts/restore.sh backups/<archivo>.sql.gz --into verde_bowl_ensayo
```

En cron, a diario:

```
0 3 * * *  cd /ruta/al/proyecto && ./scripts/backup.sh >> backups/backup.log 2>&1
```

`backup.sh` **descarta la copia si no supera tres comprobaciones**: que pese más de
10 KB, que el gzip se descomprima entero y que contenga al menos 30 tablas. Un volcado
truncado es peor que ninguno, porque da sensación de respaldo. La rotación borra las
copias viejas solo **después** de confirmar que la nueva es válida.

### Ensaya la restauración antes de necesitarla

Una copia que nunca se ha restaurado no es una copia, es un archivo. Usa `--into` para
restaurar sobre una base desechable sin tocar la de producción, y **cronometra cuánto
tarda**: ese número es tu tiempo de recuperación real, y es el dato que te falta si
alguna vez tienes que decidir entre esperar o improvisar.

Las copias viven en `./backups`, que está montado dentro del contenedor de MySQL. **Eso
no es un respaldo**: si se pierde la máquina, se pierden las copias con ella. Súbelas
a otro sitio (S3, Backblaze B2, `rclone` a lo que sea) — es lo que convierte el script
en una red de seguridad de verdad.

## Qué se pierde si no montas volúmenes

- `uploads` → las imágenes que subes desde el panel. Sin el volumen, **cada despliegue
  borra las fotos del catálogo** y deja los productos con la URL rota.
- `db_data` → todo.

Ambos están declarados en el compose. Si mueves la pila a un proveedor gestionado,
comprueba que su equivalente exista antes del primer despliegue, no después.

## Según dónde despliegues

Lo que cambia entre proveedores es la configuración, no las imágenes.

| | Qué cambia |
| --- | --- |
| **VPS con Docker Compose** | Funciona tal cual. Añade TLS con Caddy o Traefik delante. Las copias son tuyas: monta el cron. Lo más barato y lo que más te toca administrar. |
| **Railway / Render** | Usan los Dockerfile directamente. La base es gestionada: quita el servicio `db` y apunta `DB_HOST` a la suya. Las copias las hace el proveedor — **verifica la retención**, y ensaya una restauración igualmente. |
| **Cloud Run + Cloud SQL** | Recuerda que Cloud Run escala a varias instancias: los jobs con `setInterval` se duplicarían (ver `backend/src/jobs/`). Hace falta un lock antes de escalar por encima de una instancia. Cloud SQL trae recuperación a un punto en el tiempo. |

En cualquiera de los tres, `TRUST_PROXY=1` es obligatorio: sin eso el limitador de
peticiones ve la IP del proxy y todos los clientes comparten la misma cuota.

## Lo que todavía no está resuelto

- **Los jobs no tienen lock.** Con dos instancias del API se duplican las
  cancelaciones por pago vencido. Hasta resolverlo, escala solo verticalmente.
- **Las imágenes se guardan en disco.** El volumen las salva entre despliegues, pero
  no entre máquinas. Con más de un nodo hace falta S3, R2 o Cloudinary.
- **No hay reporte de errores.** Sin Sentry o equivalente, un fallo de un cliente real
  no lo ve nadie.
- **No hay alertas.** Que los pagos empiecen a fallar se descubre mirando el panel.
