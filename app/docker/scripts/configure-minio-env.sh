#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ENV_FILE="$SCRIPT_DIR/../.env"
STORAGE=local

while [ "$#" -gt 0 ]; do
  case "$1" in
    --env-file)
      [ "$#" -ge 2 ] || { echo "missing value for --env-file" >&2; exit 1; }
      ENV_FILE=$2
      shift 2
      ;;
    --storage)
      [ "$#" -ge 2 ] || { echo "missing value for --storage" >&2; exit 1; }
      STORAGE=$2
      shift 2
      ;;
    *)
      echo "unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

case "$STORAGE" in
  local|minio) ;;
  *)
    echo "--storage must be local or minio" >&2
    exit 1
    ;;
esac

[ -f "$ENV_FILE" ] || {
  echo "environment file not found: $ENV_FILE" >&2
  exit 1
}

command -v openssl >/dev/null 2>&1 || {
  echo "openssl is required to generate MinIO credentials" >&2
  exit 1
}

get_value() {
  sed -n "s/^$1=//p" "$ENV_FILE" | head -n 1
}

upsert() {
  key=$1
  value=$2
  temp_file="${ENV_FILE}.tmp.$$"
  awk -v key="$key" -v value="$value" '
    BEGIN { written = 0 }
    index($0, key "=") == 1 {
      if (!written) {
        print key "=" value
        written = 1
      }
      next
    }
    { print }
    END {
      if (!written) {
        print key "=" value
      }
    }
  ' "$ENV_FILE" > "$temp_file"
  chmod 600 "$temp_file"
  mv "$temp_file" "$ENV_FILE"
}

root_password=$(get_value MINIO_ROOT_PASSWORD)
case "$root_password" in
  ""|replace-with-*) root_password=$(openssl rand -hex 24) ;;
esac

app_password=$(get_value MINIO_SECRET_KEY)
case "$app_password" in
  ""|replace-with-*) app_password=$(openssl rand -hex 24) ;;
esac

while [ "$root_password" = "$app_password" ]; do
  app_password=$(openssl rand -hex 24)
done

upsert FILE_STORAGE "$STORAGE"
upsert LOCAL_UPLOAD_PATH /opt/im-project/huiyu/data/upload
upsert MINIO_DATA_PATH /opt/minio/data
upsert MINIO_CONSOLE_BIND_IP 172.16.59.253
upsert MINIO_BUCKET im-files
upsert MINIO_ROOT_USER minio-root
upsert MINIO_ROOT_PASSWORD "$root_password"
upsert MINIO_ACCESS_KEY im-backend
upsert MINIO_SECRET_KEY "$app_password"
chmod 600 "$ENV_FILE"

echo "MinIO environment configured in $ENV_FILE (FILE_STORAGE=$STORAGE; secrets hidden)"
