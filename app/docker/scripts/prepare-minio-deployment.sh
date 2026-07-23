#!/bin/sh
set -eu

project_dir="${PROJECT_DIR:-/opt/im-project/huiyu}"
docker_dir="${project_dir}/app/docker"
local_upload_path="${LOCAL_UPLOAD_PATH:-${project_dir}/data/upload}"
minio_data_path="${MINIO_DATA_PATH:-/opt/minio/data}"
timestamp="$(date +%Y%m%d-%H%M%S)"
backup_dir="${docker_dir}/backups/minio-deployment-${timestamp}"
nginx_stopped=false

restore_nginx() {
  if [ "${nginx_stopped}" = "true" ]; then
    docker start im-nginx >/dev/null 2>&1 || true
  fi
}
trap restore_nginx EXIT

cd "${docker_dir}"
mkdir -p "${backup_dir}/upload"

if docker ps --format '{{.Names}}' | grep -qx im-nginx; then
  docker stop im-nginx >/dev/null
  nginx_stopped=true
fi

cp -p docker-compose.intranet.yml "${backup_dir}/docker-compose.intranet.yml"
cp -p .env "${backup_dir}/.env"
chmod 600 "${backup_dir}/.env"

docker exec im-mysql sh -lc \
  'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers "$MYSQL_DATABASE"' \
  | gzip -9 >"${backup_dir}/im_db.sql.gz"

docker cp im-backend:/app/upload/. "${backup_dir}/upload/"

install -d -m 0750 "${local_upload_path}"
cp -a "${backup_dir}/upload/." "${local_upload_path}/"
find "${local_upload_path}" -type f -print0 \
  | sort -z \
  | xargs -0 -r sha256sum >"${backup_dir}/local-upload.sha256"

install -d -o 1000 -g 1000 -m 0750 "${minio_data_path}"

docker inspect im-backend \
  --format 'Mounts={{json .Mounts}} Networks={{json .NetworkSettings.Networks}} ConfigFiles={{index .Config.Labels "com.docker.compose.project.config_files"}}' \
  >"${backup_dir}/backend-runtime.txt"

echo "Deployment backup created: ${backup_dir}"
