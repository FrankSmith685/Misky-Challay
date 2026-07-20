#!/usr/bin/env sh
# =============================================================================
# Restauracion de una copia de seguridad.
#
#   ./scripts/restore.sh backups/verde_bowl_v3-20260720-030000.sql.gz
#   ./scripts/restore.sh <copia> --into verde_bowl_prueba    (ensayo sin tocar la real)
#
# Una copia que nunca se ha restaurado no es una copia: es un archivo. Ensaya la
# restauracion en una base aparte al menos una vez, ANTES de necesitarla de verdad,
# y cronometra cuanto tarda. Ese numero es tu tiempo de recuperacion real.
# =============================================================================
set -eu

cd "$(dirname "$0")/.."

[ -f .env ] && . ./.env

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Uso: ./scripts/restore.sh <archivo.sql.gz> [--into <base>]" >&2
  echo "" >&2
  echo "Copias disponibles:" >&2
  ls -1t "${BACKUP_DIR:-./backups}"/*.sql.gz 2>/dev/null | head -10 >&2 || echo "  (ninguna)" >&2
  exit 1
fi

DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-}"
TARGET="${DB_NAME:-verde_bowl_v3}"

# --into permite ensayar en una base desechable sin arriesgar la de verdad.
if [ "${2:-}" = "--into" ] && [ -n "${3:-}" ]; then
  TARGET="$3"
  DRY_RUN=1
else
  DRY_RUN=0
fi

if ! gzip -t "$FILE" 2>/dev/null; then
  echo "ERROR: el archivo esta corrupto." >&2
  exit 1
fi

if [ "$DRY_RUN" = "0" ]; then
  echo "ATENCION: se va a SOBRESCRIBIR la base \"$TARGET\" con $FILE"
  echo "Todo lo que haya ahora en esa base se pierde."
  printf 'Escribe el nombre de la base para confirmar: '
  read -r ANSWER
  if [ "$ANSWER" != "$TARGET" ]; then
    echo "Cancelado."
    exit 1
  fi
fi

START="$(date +%s)"

echo "1. Preparando la base \"$TARGET\"..."
docker compose exec -T db mysql --user="$DB_USER" --password="$DB_PASSWORD" \
  -e "DROP DATABASE IF EXISTS \`$TARGET\`; CREATE DATABASE \`$TARGET\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null

echo "2. Restaurando..."
gzip -dc "$FILE" | docker compose exec -T db mysql --user="$DB_USER" --password="$DB_PASSWORD" "$TARGET" 2>/dev/null

ELAPSED="$(( $(date +%s) - START ))"

TABLES="$(docker compose exec -T db mysql --user="$DB_USER" --password="$DB_PASSWORD" -N -B \
  -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$TARGET';" 2>/dev/null | tr -d '\r')"

echo ""
echo "Restauracion completada en ${ELAPSED}s · ${TABLES} tablas en \"$TARGET\"."

if [ "$DRY_RUN" = "1" ]; then
  echo ""
  echo "Era un ensayo. Cuando termines de revisarla:"
  echo "  docker compose exec db mysql -u$DB_USER -p -e 'DROP DATABASE \`$TARGET\`;'"
else
  echo ""
  echo "Reinicia la API para que suelte las conexiones viejas:"
  echo "  docker compose restart api"
fi
