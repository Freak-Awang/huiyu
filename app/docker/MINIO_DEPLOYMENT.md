# MinIO deployment runbook

This deployment keeps MinIO in the application Compose project and keeps the
S3 API on the Compose network. Only the console is bound to the server LAN
address.

## 0. Recover API requests returning 502

Run these commands from `/opt/im-project/huiyu/app/docker`. They inspect
container state and recent logs without printing `.env` or container secrets:

```sh
docker ps -a --filter 'name=im-' --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
docker inspect im-backend --format 'Compose files={{ index .Config.Labels "com.docker.compose.project.config_files" }}'
docker logs --tail 200 im-backend
docker logs --tail 100 im-nginx
```

If `im-backend` is exited, restarting, or unhealthy, start its dependencies and
recreate only the backend with the Compose file reported above. The commands
below use this repository's intranet file; replace `COMPOSE_FILE` when the
inspection reports a different deployment file:

```sh
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.intranet.yml}"
docker compose --env-file .env -f "${COMPOSE_FILE}" up -d mysql redis minio
docker compose --env-file .env -f "${COMPOSE_FILE}" up -d --no-deps --wait --wait-timeout 120 backend
```

Once the backend is healthy, verify container-network connectivity and restart
the existing Nginx container. `docker restart` deliberately preserves its
current image, mounts, certificates, and environment:

```sh
docker exec im-nginx nc -z -w 3 im-backend 8080
docker restart im-nginx
```

Opening the web page only proves that Nginx can serve static files. Deployment
is successful only after the API preflight also succeeds:

```sh
IM_ORIGIN="${IM_ORIGIN:-http://172.16.59.253}"
CLIENT_ORIGIN="${CLIENT_ORIGIN:-http://localhost}"
curl --fail-with-body --silent --show-error --include \
  -X OPTIONS "${IM_ORIGIN}/api/auth/login" \
  -H "Origin: ${CLIENT_ORIGIN}" \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
```

The response must be 2xx and include CORS headers. A 502 means Nginx still
cannot reach the backend; inspect the two logs above before changing any secret
or application data.

## 1. Prepare secrets

Copy `.env.example` to `.env` if this is a new deployment. For an existing
deployment, keep the current `.env` and add the MinIO settings without printing
the generated secrets:

Provision the TLS certificate/key paths, separate MySQL application and
migration accounts, a Redis password, and a unique JWT secret. Set
`BOOTSTRAP_ADMIN_PASSWORD` only for the first successful startup; remove it
from `.env` immediately afterwards and rotate that administrator password.

```sh
sh scripts/configure-minio-env.sh --storage local
```

The script preserves non-placeholder MinIO secrets, generates separate root and
application secrets when needed, and keeps `.env` mode 600.

## 2. Preserve local files

Run before recreating `im-backend`:

```sh
cd /opt/im-project/huiyu/app/docker
sh scripts/prepare-minio-deployment.sh
```

The script briefly stops Nginx, dumps MySQL, copies `/app/upload` from the
current container, restores it into the persistent host directory, creates the
MinIO data directory, and then starts Nginx again.

## 3. Deploy storage routing and MinIO

```sh
sh scripts/prepare-minio-sources.sh
docker compose --env-file .env -f docker-compose.intranet.yml build backend minio
docker compose --env-file .env -f docker-compose.intranet.yml config --quiet
docker compose --env-file .env -f docker-compose.intranet.yml up -d mysql redis backend nginx
docker compose --env-file .env -f docker-compose.intranet.yml up -d minio
docker compose --env-file .env -f docker-compose.intranet.yml --profile ops run --rm minio-init
```

Verify that `im-minio` and `im-backend` are healthy and that `im-backend` still
has `FILE_STORAGE=local`. The backend health check calls the internal
`/actuator/health` endpoint and includes database and Redis readiness.

## 4. Switch and migrate

Confirm there are no `UPLOADING` rows in `im_file_upload`, switch the default
storage, then recreate only the backend:

```sh
sh scripts/configure-minio-env.sh --storage minio
docker compose --env-file .env -f docker-compose.intranet.yml up -d --no-deps --wait --wait-timeout 120 backend
docker exec im-backend curl --fail --silent --show-error http://127.0.0.1:8080/actuator/health
sh scripts/migrate-local-files-to-minio.sh
```

The migration copies and hashes each available local object before changing its
database row. Missing or inconsistent objects remain unchanged and are listed
in `backups/minio-migration-*/missing-files.tsv`. Re-run the external login
preflight from section 0 after every backend recreation. Nginx dynamically
re-resolves `im-backend`, so a backend IP change does not require an Nginx
restart after the updated configuration has been deployed.

## 5. Rollback

Run `sh scripts/configure-minio-env.sh --storage local`, recreate `im-backend`
with `--wait --wait-timeout 120`, and repeat the internal health check and
external preflight above. Existing MinIO rows remain readable because downloads
and cleanup route by each row's `storage_type`. Keep the host local-file
directory for at least seven days.

## 6. Validate backend recreation resilience

Run this in staging, or during a maintenance window after confirming `/app/upload`
is persistent or all active files use MinIO. It proves that Nginx follows a new
backend container address without being restarted:

```sh
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.intranet.yml}"
docker exec im-nginx nginx -t
OLD_BACKEND_IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' im-backend)"
docker compose --env-file .env -f "${COMPOSE_FILE}" up -d --no-deps --force-recreate --wait --wait-timeout 120 backend
NEW_BACKEND_IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' im-backend)"
printf 'backend IP: %s -> %s\n' "${OLD_BACKEND_IP}" "${NEW_BACKEND_IP}"
sleep 12
docker exec im-nginx nc -z -w 3 im-backend 8080
```

Do not restart Nginx during this test. Finish by running the external login
preflight from section 0, a valid and invalid login, and a WebSocket reconnect.
The invalid login must return an application-level response rather than 502.
