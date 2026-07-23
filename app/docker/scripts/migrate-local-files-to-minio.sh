#!/bin/sh
set -eu

compose_file="${COMPOSE_FILE:-docker-compose.intranet.yml}"
env_file="${ENV_FILE:-.env}"
report_root="${MIGRATION_REPORT_ROOT:-./backups}"

case "${env_file}" in
  /*|./*|../*) ;;
  *) env_file="./${env_file}" ;;
esac

if [ ! -f "${env_file}" ]; then
  echo "Missing environment file: ${env_file}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "${env_file}"
set +a

: "${MYSQL_DATABASE:=im_db}"
: "${MINIO_BUCKET:=im-files}"
: "${LOCAL_UPLOAD_PATH:=/opt/im-project/huiyu/data/upload}"

if [ "${MINIO_BUCKET}" != "im-files" ]; then
  echo "This migration is restricted to the im-files bucket." >&2
  exit 1
fi

active_uploads="$(
  docker exec im-mysql sh -lc \
    'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --batch --skip-column-names "$MYSQL_DATABASE" -e "SELECT COUNT(*) FROM im_file_upload WHERE status = '\''UPLOADING'\'';"'
)"
if [ "${active_uploads}" != "0" ]; then
  echo "Refusing migration while ${active_uploads} upload task(s) are active." >&2
  exit 1
fi

timestamp="$(date +%Y%m%d-%H%M%S)"
report_dir="${report_root}/minio-migration-${timestamp}"
mkdir -p "${report_dir}"
manifest="${report_dir}/local-files.tsv"
missing="${report_dir}/missing-files.tsv"
migrated="${report_dir}/migrated-files.tsv"
: >"${missing}"
: >"${migrated}"

docker exec im-mysql sh -lc \
  'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --batch --skip-column-names "$MYSQL_DATABASE" -e "SELECT id, object_key, file_size, COALESCE(sha256, '\'''\'' ) FROM im_file WHERE storage_type = '\''local'\'' AND status = '\''AVAILABLE'\'' ORDER BY id;"' \
  >"${manifest}"

tab="$(printf '\t')"
while IFS="${tab}" read -r file_id object_key expected_size expected_sha; do
  [ -n "${file_id}" ] || continue
  case "${object_key}" in
    /*|*..*)
      echo "Unsafe object key for file ${file_id}: ${object_key}" >&2
      exit 1
      ;;
  esac

  source_file="${LOCAL_UPLOAD_PATH}/${object_key}"
  if [ ! -f "${source_file}" ]; then
    printf '%s\t%s\t%s\n' "${file_id}" "${object_key}" "source file missing" >>"${missing}"
    continue
  fi

  actual_size="$(wc -c <"${source_file}" | tr -d ' ')"
  actual_sha="$(sha256sum "${source_file}" | awk '{print $1}')"
  if [ "${actual_size}" != "${expected_size}" ]; then
    printf '%s\t%s\t%s\n' "${file_id}" "${object_key}" "size mismatch" >>"${missing}"
    continue
  fi
  if [ -n "${expected_sha}" ] && [ "${actual_sha}" != "${expected_sha}" ]; then
    printf '%s\t%s\t%s\n' "${file_id}" "${object_key}" "sha256 mismatch" >>"${missing}"
    continue
  fi

  remote_sha="$(
    docker compose --env-file "${env_file}" -f "${compose_file}" --profile ops run --rm --no-deps \
      -e "OBJECT_KEY=${object_key}" \
      -v "${LOCAL_UPLOAD_PATH}:/source:ro" \
      --entrypoint /bin/sh minio-tools -c '
        set -eu
        config_dir="$(mktemp -d)"
        trap '\''rm -rf "${config_dir}"'\'' EXIT
        export MC_CONFIG_DIR="${config_dir}"
        mc alias set app "${MINIO_ENDPOINT}" "${MINIO_ACCESS_KEY}" "${MINIO_SECRET_KEY}" --api S3v4 >/dev/null
        mc cp --quiet "/source/${OBJECT_KEY}" "app/${MINIO_BUCKET}/${OBJECT_KEY}"
        mc cat "app/${MINIO_BUCKET}/${OBJECT_KEY}" | sha256sum | awk '\''{print $1}'\''
      ' | tail -n 1
  )"
  if [ "${remote_sha}" != "${actual_sha}" ]; then
    printf '%s\t%s\t%s\n' "${file_id}" "${object_key}" "remote sha256 mismatch" >>"${missing}"
    continue
  fi

  migration_sql="UPDATE im_file SET storage_type = 'minio', bucket = '${MINIO_BUCKET}' WHERE id = ${file_id} AND storage_type = 'local' AND status = 'AVAILABLE';"
  docker exec -e "MIGRATION_SQL=${migration_sql}" im-mysql sh -lc \
    'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e "$MIGRATION_SQL"'
  printf '%s\t%s\t%s\t%s\n' "${file_id}" "${object_key}" "${actual_size}" "${actual_sha}" >>"${migrated}"
done <"${manifest}"

echo "Migration report: ${report_dir}"
echo "Migrated objects: $(wc -l <"${migrated}" | tr -d ' ')"
echo "Unresolved objects: $(wc -l <"${missing}" | tr -d ' ')"

if [ -s "${missing}" ]; then
  echo "Review missing-files.tsv and restore from backup before marking records BLOCKED." >&2
  exit 2
fi
