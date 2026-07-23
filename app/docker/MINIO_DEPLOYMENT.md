# MinIO deployment runbook

This deployment keeps MinIO in the application Compose project and keeps the
S3 API on the Compose network. Only the console is bound to the server LAN
address.

## 1. Prepare secrets

Copy `.env.example` to `.env` if this is a new deployment. For an existing
deployment, keep the current `.env` and add the MinIO settings without printing
the generated secrets:

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
docker compose --env-file .env -f docker-compose.intranet.yml up -d mysql redis backend nginx
docker compose --env-file .env -f docker-compose.intranet.yml up -d minio
docker compose --env-file .env -f docker-compose.intranet.yml --profile ops run --rm minio-init
```

Verify that `im-minio` is healthy and that `im-backend` still has
`FILE_STORAGE=local`.

## 4. Switch and migrate

Confirm there are no `UPLOADING` rows in `im_file_upload`, switch the default
storage, then recreate only the backend:

```sh
sh scripts/configure-minio-env.sh --storage minio
docker compose --env-file .env -f docker-compose.intranet.yml up -d --no-deps backend
sh scripts/migrate-local-files-to-minio.sh
```

The migration copies and hashes each available local object before changing its
database row. Missing or inconsistent objects remain unchanged and are listed
in `backups/minio-migration-*/missing-files.tsv`.

## 5. Rollback

Run `sh scripts/configure-minio-env.sh --storage local` and recreate only
`im-backend`. Existing MinIO rows remain readable because downloads and cleanup
route by each row's `storage_type`. Keep the host local-file directory for at
least seven days.
