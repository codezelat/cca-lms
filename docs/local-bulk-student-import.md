# Local Bulk Student Import

This workflow is for creating student accounts locally from a CSV, assigning each student to up to 3 programmes, and optionally sending the welcome email with login credentials.

## What You Need

- `name`: Required for new students. If the email already belongs to an active student, the existing account name is kept.
- `email`: Required. Must be unique inside the CSV.
- `password`: Optional. Leave blank to auto-generate a strong password. If the student already exists, this column is ignored.
- `programme_1`, `programme_2`, `programme_3`: At least one is required. Each cell can contain either:
  - the programme ID, or
  - the exact programme title

Preferred approach: use programme IDs so title changes do not break the import.

## CSV Format

Use these exact headers:

```csv
name,email,password,programme_1,programme_2,programme_3
Jane Doe,jane@example.com,,cmabc123def456ghi789jkl,Data Analytics Bootcamp,
John Smith,john@example.com,TempPass@2026,Full Stack Web Development,UI Engineering,
```

Rules:

- Keep one student per row.
- Do not repeat the same email on multiple rows.
- If a programme title contains commas, keep the cell quoted in CSV.
- Blank `password` means the script will generate one during `--apply`.
- Blank `programme_2` and `programme_3` are fine.

Checked-in starter template:

- [`scripts/templates/student-bulk-import-template.csv`](/Users/sayuru/Documents/GitHub/cca-lms/scripts/templates/student-bulk-import-template.csv)

## Commands

List the current non-archived programmes:

```bash
npm run students:import -- --list-programmes
```

Write a blank CSV template locally:

```bash
npm run students:import -- --write-template ./imports/students.csv
```

Run a validation-only dry-run:

```bash
npm run students:import -- --csv ./imports/students.csv
```

Apply the import and send welcome emails:

```bash
npm run students:import -- --csv ./imports/students.csv --apply
```

Apply the import without sending emails:

```bash
npm run students:import -- --csv ./imports/students.csv --apply --skip-emails
```

Default operator name shown in the email and audit metadata is `CCA`.

Set a different operator name for a single run:

```bash
npm run students:import -- --csv ./imports/students.csv --apply --operator "Admissions Team"
```

Or set it globally with an environment variable:

```bash
IMPORT_OPERATOR="CCA" npm run students:import -- --csv ./imports/students.csv --apply
```

## Environment Requirements

Required for dry-run and apply:

- `DATABASE_URL`

Also required when sending emails:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL` recommended
- `APP_URL` recommended

Email link behavior:

- If `EMAIL_APP_URL` is set, emails use that domain.
- Otherwise emails use `APP_URL`.
- If `APP_URL` points to localhost, emails automatically fall back to `https://lms.cca.it.com`.

## Reports

Each run writes reports into:

```text
.artifacts/bulk-student-import/<timestamp>/
```

Files:

- `summary.json`: top-level counts and settings for the run
- `results.json`: row-by-row machine-readable output
- `results.csv`: row-by-row spreadsheet-friendly output
- `credentials.csv`: only for newly created students; includes the password used for that account

Treat `credentials.csv` as sensitive and delete it after you finish distributing credentials.

## Edge Cases Handled

- Duplicate emails inside the CSV are blocked in preflight.
- Existing `LECTURER` or `ADMIN` accounts are blocked.
- Existing non-active students are blocked.
- Existing students with no password are blocked.
- Duplicate programmes in the same row are deduplicated with a warning.
- Existing student enrollments are skipped instead of duplicated.
- Archived or missing programmes are reported as errors.
- Title matches that are ambiguous are reported as errors and must be replaced with a programme ID.

## Safe Workflow

1. Run `--list-programmes`.
2. Prepare the CSV.
3. Run the dry-run first and fix every reported error.
4. Run again with `--apply`.
5. Review `results.csv` and `credentials.csv`.
