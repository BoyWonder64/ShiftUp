-- Renames the ATTENDEE role to CUSTOMER (clearer name for the client-facing
-- role). RENAME VALUE updates every column using this enum (users.role,
-- role_permissions.role, role_visibilities.viewer_role/target_role) in place -
-- no data migration needed, existing rows keep their meaning.
ALTER TYPE "user_role" RENAME VALUE 'ATTENDEE' TO 'CUSTOMER';
