#!/usr/bin/env sh
# =============================================================================
# Copia de seguridad de la base de datos.
#
#   ./scripts/backup.sh                 copia con la fecha de hoy
#   RETENTION_DAYS=30 ./scripts/backup.sh
#
# En cron, una vez al dia:
#   0 3 * * *  cd /ruta/al/proyecto && ./scripts/backup.sh >> backups/backup.log 2>&1
#
# La base contiene pedidos, pagos y SALDO PREPAGADO de clientes. Perderla no es un
# contratiempo tecnico: es dinero que los clientes pagaron y del que no queda
# constancia. Este script cuesta unos minutos; el incidente que evita, el negocio.
# =============================================================================
set -eu

cd "$(dirname "$0")/.."

[ -f .env ] && . ./.env

DB_NAME="${DB_NAME:-DulceFlow}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${BACKUP_DIR}/${DB_NAME}-${STAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "Copiando ${DB_NAME} -> ${OUT}"

# --single-transaction: copia consistente sin bloquear la operacion. Sin esto, un
# pedido creado a mitad del volcado puede quedar sin sus lineas.
# --routines --triggers --events: el esquema completo, no solo las tablas.
# La contrasena va por entorno: en la linea de comandos seria visible en `ps`.
MYSQL_PWD="$DB_PASSWORD" docker compose exec -T db mysqldump \
  --user="$DB_USER" \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --events \
  --set-gtid-purged=OFF \
  "$DB_NAME" 2>/dev/null | gzip -9 > "$OUT"

# Un volcado vacio o truncado es peor que ninguno: da falsa sensacion de respaldo.
SIZE="$(wc -c < "$OUT")"
if [ "$SIZE" -lt 10240 ]; then
  echo "ERROR: la copia pesa ${SIZE} bytes, algo fallo. Se descarta." >&2
  rm -f "$OUT"
  exit 1
fi

# Comprobacion real de integridad: que el gzip se pueda descomprimir entero y que
# el contenido tenga tablas. Detecta el volcado cortado a mitad.
if ! gzip -t "$OUT" 2>/dev/null; then
  echo "ERROR: la copia esta corrupta (gzip invalido). Se descarta." >&2
  rm -f "$OUT"
  exit 1
fi

TABLES="$(gzip -dc "$OUT" | grep -c 'CREATE TABLE' || true)"
if [ "$TABLES" -lt 30 ]; then
  echo "ERROR: la copia solo tiene ${TABLES} tablas, se esperaban 60+. Se descarta." >&2
  rm -f "$OUT"
  exit 1
fi

echo "OK: ${OUT} ($(du -h "$OUT" | cut -f1), ${TABLES} tablas)"

# Rotacion: las copias viejas se borran DESPUES de confirmar que la nueva es valida.
find "$BACKUP_DIR" -name "${DB_NAME}-*.sql.gz" -type f -mtime "+${RETENTION_DAYS}" -print -delete

echo "Copias disponibles: $(find "$BACKUP_DIR" -name "${DB_NAME}-*.sql.gz" | wc -l)"
