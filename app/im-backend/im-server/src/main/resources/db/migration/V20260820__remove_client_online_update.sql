-- Remove the retired desktop online-update module while preserving Flyway history.
-- Drop dependent tables before the release table to satisfy foreign-key constraints.
DROP TABLE IF EXISTS im_client_release_audit;
DROP TABLE IF EXISTS im_client_release_target;
DROP TABLE IF EXISTS im_client_update_event;
DROP TABLE IF EXISTS im_client_release;
