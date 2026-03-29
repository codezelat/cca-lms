# Database Backup Validation

## Scope

This document records what was verified for the database backup workflow and for a successfully downloaded backup archive.

Validated archive:

- `2026-03-29_01-51-21_db-backup`

Validated extracted files:

- `manifest.json`
- `RESTORE.md`
- `roles.sql`
- `schema.sql`
- `data.sql`

## Verified Checks

The following checks passed for the validated archive:

1. `manifest.json` was present and internally coherent.
2. `manifest.json` reported the expected backup metadata:
   - `version`: `2.0.0`
   - `source`: `postgres-tools`
   - `retentionDays`: `14`
   - `prefix`: `db-backups`
   - `schemaScope`: `["public"]`
3. `roles.sql`, `schema.sql`, and `data.sql` all existed.
4. Each SQL file matched the size recorded in `manifest.json`.
5. Each SQL file matched the SHA-256 checksum recorded in `manifest.json`.
6. `roles.sql` contained a real PostgreSQL role dump.
7. `schema.sql` contained the expected application schema objects and enum definitions.
8. `data.sql` contained real table data using PostgreSQL `COPY` statements.
9. `RESTORE.md` matched the actual archive contents and restore order.

## Result

The validated backup archive is structurally correct and suitable to keep as a real recovery artifact.

What is proven by this validation:

- backup generation completed successfully
- archive packaging completed successfully
- manifest metadata is trustworthy for this archive
- the downloaded files are intact

What is not fully proven by this validation alone:

- a full restore into a fresh target database

Only an actual restore smoke test into a disposable PostgreSQL or Supabase target can prove end-to-end restoreability.

## Security Notes

These backup files are sensitive.

- `roles.sql` contains role definitions and password hashes
- `data.sql` contains application data, including user records and password hashes

Requirements:

1. Keep the R2 backup location private.
2. Do not expose backup archives through public bucket URLs.
3. Only allow signed or authenticated admin downloads.

## Recommended Restore Smoke Test

Run this against a disposable target database, not production.

Suggested order:

1. Review `manifest.json`.
2. Restore `schema.sql`.
3. Restore `data.sql`.
4. Restore `roles.sql` only if the target environment intentionally needs those roles.
5. Start the app against the restored database and verify login, dashboard access, programmes, and backups.

Example:

```bash
psql "$TARGET_DATABASE_URL" -f schema.sql
psql "$TARGET_DATABASE_URL" -f data.sql
```

If role recreation is required:

```bash
psql "$TARGET_DATABASE_URL" -f roles.sql
```

## Operational Conclusion

The backup system is producing valid portable PostgreSQL logical backup bundles.

Current confidence level:

- archive generation: verified
- archive integrity: verified
- admin download path: verified
- end-to-end restore: pending one disposable restore smoke test
