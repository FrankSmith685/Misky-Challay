#!/bin/sh
set -eu

deployment_dir="${HOME}/misky-live"
sql_file="${deployment_dir}/local-payments.sql"
test -f "$sql_file"
chmod 600 "$sql_file"
docker exec -i misky-live-db-1 sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql -u "$MYSQL_USER" "$MYSQL_DATABASE"' < "$sql_file"
rm -- "$sql_file"
printf '%s\n' 'Yape/Plin settings imported; transfer file removed'
