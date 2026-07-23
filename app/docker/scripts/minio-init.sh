#!/bin/sh
set -eu

: "${MINIO_ROOT_USER:?MINIO_ROOT_USER is required}"
: "${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD is required}"
: "${MINIO_ACCESS_KEY:?MINIO_ACCESS_KEY is required}"
: "${MINIO_SECRET_KEY:?MINIO_SECRET_KEY is required}"
: "${MINIO_BUCKET:?MINIO_BUCKET is required}"

if [ "${MINIO_BUCKET}" != "im-files" ]; then
  echo "This deployment policy is restricted to the im-files bucket." >&2
  exit 1
fi

endpoint="${MINIO_ENDPOINT:-http://minio:9000}"
config_dir="$(mktemp -d)"
trap 'rm -rf "${config_dir}"' EXIT
export MC_CONFIG_DIR="${config_dir}"

mc alias set admin "${endpoint}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" --api S3v4 >/dev/null
mc ready admin
mc mb --ignore-existing "admin/${MINIO_BUCKET}"
mc anonymous set none "admin/${MINIO_BUCKET}"
mc admin policy create admin im-files-rw /opt/minio/im-files-policy.json
mc admin user add admin "${MINIO_ACCESS_KEY}" "${MINIO_SECRET_KEY}"
mc admin policy attach admin im-files-rw --user "${MINIO_ACCESS_KEY}"

mc alias set app "${endpoint}" "${MINIO_ACCESS_KEY}" "${MINIO_SECRET_KEY}" --api S3v4 >/dev/null
mc ls "app/${MINIO_BUCKET}" >/dev/null

echo "MinIO bucket and application identity are ready."
