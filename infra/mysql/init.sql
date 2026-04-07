-- Enforce principle of least privilege in local development.
-- The entrypoint already creates DB and app user, here we ensure permissions are scoped.
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX ON orbital_directive.* TO 'orbital_user'@'%';
FLUSH PRIVILEGES;
