# Database migrations

Application-managed migrations now live in:

`im-server/src/main/resources/db/migration`

Flyway records every applied version in `flyway_schema_history`. Existing
installations are baselined at `20260726`; migrations after that version are
applied exactly once.

## Release procedure

1. Back up the database and verify the backup can be restored.
2. Run `20260728_preflight_core_foreign_keys.sql`. Every orphan count must be
   zero before the foreign-key migration is allowed to run.
3. Deploy one backend instance and wait for Flyway to complete.
4. Verify `flyway_schema_history`, application health, login, message send/read,
   file upload/download, and WebSocket reconnection.
5. Deploy the remaining backend instances.

The normal datasource account has DML-only privileges. Flyway uses the
separate `MYSQL_MIGRATION_USER` account.

## Rollback

Database migrations are forward-only. Do not run the destructive legacy
`20260606_remove_file_transfer.sql` during this release. If migration or
verification fails, stop the new backend, restore the tested backup, and
restart the previous image and configuration.

Legacy SQL files in this directory are retained for historical deployments;
they are not discovered automatically by Flyway.
