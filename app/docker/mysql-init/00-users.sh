#!/bin/sh
set -eu

: "${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD is required}"
: "${MYSQL_DATABASE:?MYSQL_DATABASE is required}"
: "${MYSQL_USER:?MYSQL_USER is required}"
: "${MYSQL_MIGRATION_USER:?MYSQL_MIGRATION_USER is required}"
: "${MYSQL_MIGRATION_PASSWORD:?MYSQL_MIGRATION_PASSWORD is required}"

case "${MYSQL_DATABASE}:${MYSQL_USER}:${MYSQL_MIGRATION_USER}" in
  *[!A-Za-z0-9_:]*)
    echo "Database and account names may only contain letters, digits, and underscores." >&2
    exit 1
    ;;
esac

migration_password=$(printf '%s' "${MYSQL_MIGRATION_PASSWORD}" | sed "s/'/''/g")

mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" <<SQL
REVOKE ALL PRIVILEGES, GRANT OPTION FROM '${MYSQL_USER}'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`${MYSQL_DATABASE}\`.* TO '${MYSQL_USER}'@'%';

CREATE USER IF NOT EXISTS '${MYSQL_MIGRATION_USER}'@'%' IDENTIFIED BY '${migration_password}';
ALTER USER '${MYSQL_MIGRATION_USER}'@'%' IDENTIFIED BY '${migration_password}';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES
  ON \`${MYSQL_DATABASE}\`.* TO '${MYSQL_MIGRATION_USER}'@'%';
FLUSH PRIVILEGES;
SQL
