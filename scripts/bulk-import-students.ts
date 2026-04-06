import "dotenv/config";
import * as fs from "node:fs/promises";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { hash } from "bcryptjs";
import * as XLSX from "xlsx";

type AuditModule = typeof import("../lib/audit");
type PrismaModule = typeof import("../lib/prisma");
type ResendModule = typeof import("../lib/resend");
type SecurityModule = typeof import("../lib/security");

interface SharedModules {
  createAuditLog: AuditModule["createAuditLog"];
  createAuditLogs: AuditModule["createAuditLogs"];
  generateSecurePassword: SecurityModule["generateSecurePassword"];
  prisma: PrismaModule["prisma"];
  sendUserCreatedEmail: ResendModule["sendUserCreatedEmail"];
}

let sharedModulesPromise: Promise<SharedModules> | null = null;

const CSV_HEADERS = [
  "name",
  "email",
  "password",
  "programme_1",
  "programme_2",
  "programme_3",
] as const;

const PROGRAMME_COLUMNS = ["programme_1", "programme_2", "programme_3"] as const;
const DEFAULT_TEMPLATE_PATH = "student-bulk-import-template.csv";
const DEFAULT_OPERATOR = process.env.IMPORT_OPERATOR?.trim() || "CCA";
const IMPORT_SOURCE = "LOCAL_BULK_STUDENT_IMPORT";

const HEADER_ALIASES: Record<(typeof CSV_HEADERS)[number], string[]> = {
  name: ["name", "full_name", "student_name"],
  email: ["email", "student_email"],
  password: ["password", "initial_password"],
  programme_1: ["programme_1", "programme1", "program_1", "course_1"],
  programme_2: ["programme_2", "programme2", "program_2", "course_2"],
  programme_3: ["programme_3", "programme3", "program_3", "course_3"],
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface CliOptions {
  apply: boolean;
  csvPath?: string;
  help: boolean;
  listProgrammes: boolean;
  operator: string;
  outputDir?: string;
  sendEmails: boolean;
  writeTemplatePath?: string;
}

interface CsvRow {
  email: string;
  lineNumber: number;
  name: string;
  password: string;
  programmeRefs: string[];
}

interface ExistingUser {
  email: string;
  id: string;
  name: string | null;
  password: string | null;
  role: string;
  status: string;
}

interface ProgrammeRecord {
  id: string;
  status: string;
  title: string;
}

interface PreparedRow {
  action: "create_student" | "reuse_existing_student" | "none";
  email: string;
  error: string | null;
  existingUser: ExistingUser | null;
  lineNumber: number;
  missingProgrammeIds: string[];
  missingProgrammes: ProgrammeRecord[];
  name: string;
  password: string;
  passwordMode:
    | "auto_generated"
    | "ignored_for_existing_user"
    | "none"
    | "provided";
  programmeRefs: string[];
  raw: CsvRow;
  resolvedProgrammes: ProgrammeRecord[];
  warnings: string[];
}

interface ResultRow {
  credentialPassword: string | null;
  email: string;
  emailPlanned: boolean;
  emailSent: boolean | null;
  enrollmentsAlreadyPresent: number;
  enrollmentsCreated: number;
  error: string | null;
  lineNumber: number;
  name: string;
  outcome:
    | "already_enrolled"
    | "created_and_enrolled"
    | "dry_run"
    | "enrolled_existing_user"
    | "error";
  passwordMode: PreparedRow["passwordMode"];
  plannedAction: PreparedRow["action"];
  requestedProgrammeRefs: string[];
  resolvedProgrammeIds: string[];
  resolvedProgrammeTitles: string[];
  userId: string | null;
  warnings: string[];
}

interface ImportSummary {
  applyRequested: boolean;
  csvPath: string;
  durationMs: number;
  emailFailures: number;
  emailsAttempted: number;
  emailsSkipped: number;
  emailsSucceeded: number;
  endedAt: string;
  newUsersCreated: number;
  operator: string;
  outputDir: string;
  preflightErrors: number;
  readyRows: number;
  reportFiles: {
    credentialsCsv?: string;
    resultsCsv: string;
    resultsJson: string;
    summaryJson: string;
  };
  rowsAlreadyEnrolled: number;
  rowsProcessed: number;
  rowsWithErrors: number;
  sendEmails: boolean;
  startedAt: string;
  totalEnrollmentsCreated: number;
  totalRows: number;
  usersReused: number;
}

function unwrapModule<T extends object>(moduleNamespace: { default?: T } & Partial<T>) {
  return (moduleNamespace.default ?? moduleNamespace) as T;
}

async function getSharedModules(): Promise<SharedModules> {
  if (!sharedModulesPromise) {
    sharedModulesPromise = Promise.all([
      import("../lib/audit"),
      import("../lib/prisma"),
      import("../lib/resend"),
      import("../lib/security"),
    ]).then(([auditNamespace, prismaNamespace, resendNamespace, securityNamespace]) => {
      const auditModule = unwrapModule<AuditModule>(
        auditNamespace as { default?: AuditModule } & Partial<AuditModule>,
      );
      const prismaModule = unwrapModule<PrismaModule>(
        prismaNamespace as { default?: PrismaModule } & Partial<PrismaModule>,
      );
      const resendModule = unwrapModule<ResendModule>(
        resendNamespace as { default?: ResendModule } & Partial<ResendModule>,
      );
      const securityModule = unwrapModule<SecurityModule>(
        securityNamespace as { default?: SecurityModule } & Partial<SecurityModule>,
      );

      return {
        createAuditLog: auditModule.createAuditLog,
        createAuditLogs: auditModule.createAuditLogs,
        generateSecurePassword: securityModule.generateSecurePassword,
        prisma: prismaModule.prisma,
        sendUserCreatedEmail: resendModule.sendUserCreatedEmail,
      };
    });
  }

  return sharedModulesPromise;
}

function printHelp() {
  console.log(`Usage:
  node --import tsx scripts/bulk-import-students.ts --list-programmes
  node --import tsx scripts/bulk-import-students.ts --write-template [path]
  node --import tsx scripts/bulk-import-students.ts --csv ./students.csv
  node --import tsx scripts/bulk-import-students.ts --csv ./students.csv --apply

Options:
  --csv <path>           CSV file to import
  --apply                Write to the database. Without this flag the script is dry-run only
  --skip-emails          Do not send welcome emails to newly created students
  --operator <name>      Name shown in welcome emails and audit metadata
  --output-dir <path>    Directory for result reports
  --list-programmes      Print current non-archived programmes with IDs
  --write-template [p]   Write a blank CSV template (default: ${DEFAULT_TEMPLATE_PATH})
  --help                 Show this message

CSV columns:
  ${CSV_HEADERS.join(", ")}

Programme cells accept either the programme ID or the exact programme title.
`);
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    apply: false,
    help: false,
    listProgrammes: false,
    operator: DEFAULT_OPERATOR,
    sendEmails: true,
  };

  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--apply") {
      options.apply = true;
      continue;
    }

    if (arg === "--skip-emails") {
      options.sendEmails = false;
      continue;
    }

    if (arg === "--send-emails") {
      options.sendEmails = true;
      continue;
    }

    if (arg === "--list-programmes") {
      options.listProgrammes = true;
      continue;
    }

    if (arg === "--csv") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--csv requires a file path.");
      }
      options.csvPath = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--csv=")) {
      options.csvPath = arg.slice("--csv=".length);
      continue;
    }

    if (arg === "--operator") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--operator requires a name.");
      }
      options.operator = value.trim();
      index += 1;
      continue;
    }

    if (arg.startsWith("--operator=")) {
      options.operator = arg.slice("--operator=".length).trim();
      continue;
    }

    if (arg === "--output-dir") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--output-dir requires a directory path.");
      }
      options.outputDir = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--output-dir=")) {
      options.outputDir = arg.slice("--output-dir=".length);
      continue;
    }

    if (arg === "--write-template") {
      const value = argv[index + 1];
      if (value && !value.startsWith("--")) {
        options.writeTemplatePath = value;
        index += 1;
      } else {
        options.writeTemplatePath = DEFAULT_TEMPLATE_PATH;
      }
      continue;
    }

    if (arg.startsWith("--write-template=")) {
      options.writeTemplatePath = arg.slice("--write-template=".length);
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    positional.push(arg);
  }

  if (!options.csvPath && positional.length > 0) {
    options.csvPath = positional[0];
  }

  if (!options.operator) {
    options.operator = DEFAULT_OPERATOR;
  }

  return options;
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for this operation.`);
  }
  return value;
}

function ensureApplyPreflight(sendEmails: boolean) {
  requireEnv("DATABASE_URL");

  if (sendEmails) {
    requireEnv("RESEND_API_KEY");
  }
}

function buildTemplateContent() {
  return `${CSV_HEADERS.join(",")}\n`;
}

async function writeTemplate(targetPath: string) {
  const absolutePath = path.resolve(targetPath);

  if (existsSync(absolutePath)) {
    throw new Error(`Refusing to overwrite existing file: ${absolutePath}`);
  }

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buildTemplateContent(), "utf8");
  console.log(`Template written to ${absolutePath}`);
}

async function listProgrammes() {
  requireEnv("DATABASE_URL");
  const { prisma } = await getSharedModules();

  const programmes = await prisma.course.findMany({
    where: {
      status: {
        not: "ARCHIVED",
      },
    },
    select: {
      id: true,
      status: true,
      title: true,
    },
    orderBy: {
      title: "asc",
    },
  });

  if (programmes.length === 0) {
    console.log("No non-archived programmes found.");
    return;
  }

  console.table(
    programmes.map((programme) => ({
      id: programme.id,
      status: programme.status,
      title: programme.title,
    })),
  );
}

function toCellValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return `${value}`.trim();
}

function buildColumnIndexMap(headers: string[]) {
  const columnIndexes = new Map<(typeof CSV_HEADERS)[number], number>();

  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    const canonical = (Object.entries(HEADER_ALIASES).find(([, aliases]) =>
      aliases.includes(normalized),
    )?.[0] || null) as (typeof CSV_HEADERS)[number] | null;

    if (!canonical) {
      return;
    }

    if (columnIndexes.has(canonical)) {
      throw new Error(
        `CSV header "${header}" maps to "${canonical}" more than once.`,
      );
    }

    columnIndexes.set(canonical, index);
  });

  const missing = CSV_HEADERS.filter((header) => !columnIndexes.has(header));
  if (missing.length > 0) {
    throw new Error(
      `CSV is missing required columns: ${missing.join(", ")}.`,
    );
  }

  return columnIndexes;
}

async function parseCsv(csvPath: string) {
  const absoluteCsvPath = path.resolve(csvPath);
  if (!existsSync(absoluteCsvPath)) {
    throw new Error(`CSV file not found: ${absoluteCsvPath}`);
  }

  if (path.extname(absoluteCsvPath).toLowerCase() !== ".csv") {
    throw new Error("Only .csv files are supported.");
  }

  const workbook = XLSX.readFile(absoluteCsvPath, {
    raw: false,
  });
  const firstSheet = workbook.SheetNames[0];

  if (!firstSheet) {
    throw new Error("CSV file is empty.");
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheet], {
    blankrows: false,
    defval: "",
    header: 1,
    raw: false,
  });

  if (rows.length < 2) {
    throw new Error("CSV must contain a header row and at least one data row.");
  }

  const headers = rows[0].map((cell) => toCellValue(cell));
  const columnIndexes = buildColumnIndexMap(headers);
  const parsedRows: CsvRow[] = [];

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const rawCells = rows[rowIndex];
    const cells = rawCells.map((cell) => toCellValue(cell));
    const firstValue = cells.find((cell) => cell.length > 0) || "";

    if (!firstValue) {
      continue;
    }

    if (firstValue.startsWith("#")) {
      continue;
    }

    const getValue = (header: (typeof CSV_HEADERS)[number]) =>
      toCellValue(cells[columnIndexes.get(header) ?? -1]);

    parsedRows.push({
      email: getValue("email").toLowerCase(),
      lineNumber: rowIndex + 1,
      name: getValue("name"),
      password: getValue("password"),
      programmeRefs: PROGRAMME_COLUMNS.map((column) => getValue(column)).filter(
        (value) => value.length > 0,
      ),
    });
  }

  if (parsedRows.length === 0) {
    throw new Error("CSV did not contain any importable rows.");
  }

  return {
    absoluteCsvPath,
    rows: parsedRows,
  };
}

function dedupe(values: string[]) {
  return Array.from(new Set(values));
}

function escapeCsv(value: string | number | boolean | null | undefined) {
  const stringValue =
    value === null || value === undefined ? "" : `${value}`;
  if (
    stringValue.includes(",") ||
    stringValue.includes("\"") ||
    stringValue.includes("\n")
  ) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }
  return stringValue;
}

function resolveProgramme(
  reference: string,
  programmesById: Map<string, ProgrammeRecord>,
  programmesByLowerTitle: Map<string, ProgrammeRecord[]>,
):
  | { error: string; programme?: never }
  | { error?: never; programme: ProgrammeRecord } {
  const byId = programmesById.get(reference);
  if (byId) {
    if (byId.status === "ARCHIVED") {
      return { error: `Programme "${reference}" is archived.` };
    }
    return { programme: byId };
  }

  const matches = programmesByLowerTitle.get(reference.toLowerCase()) || [];
  const activeMatches = matches.filter((programme) => programme.status !== "ARCHIVED");

  if (activeMatches.length === 1) {
    return { programme: activeMatches[0] };
  }

  if (activeMatches.length > 1) {
    return {
      error: `Programme "${reference}" matches more than one active programme title. Use the programme ID instead.`,
    };
  }

  if (matches.length > 0) {
    return { error: `Programme "${reference}" is archived.` };
  }

  return { error: `Programme "${reference}" was not found.` };
}

async function prepareRows(csvRows: CsvRow[]) {
  const { prisma } = await getSharedModules();
  const emailToLines = new Map<string, number[]>();
  for (const row of csvRows) {
    const current = emailToLines.get(row.email) || [];
    current.push(row.lineNumber);
    emailToLines.set(row.email, current);
  }

  const [rawUsers, rawProgrammes] = await Promise.all([
    prisma.user.findMany({
      where: {
        email: {
          in: dedupe(csvRows.map((row) => row.email)),
        },
      },
      select: {
        email: true,
        id: true,
        name: true,
        password: true,
        role: true,
        status: true,
      },
    }),
    prisma.course.findMany({
      select: {
        id: true,
        status: true,
        title: true,
      },
      orderBy: {
        title: "asc",
      },
    }),
  ]);

  const users: ExistingUser[] = rawUsers.map((user) => ({
    email: user.email,
    id: user.id,
    name: user.name,
    password: user.password,
    role: user.role,
    status: user.status,
  }));

  const programmes: ProgrammeRecord[] = rawProgrammes.map((programme) => ({
    id: programme.id,
    status: programme.status,
    title: programme.title,
  }));

  const userMap = new Map<string, ExistingUser>(
    users.map((user) => [user.email.toLowerCase(), user]),
  );
  const programmesById = new Map<string, ProgrammeRecord>(
    programmes.map((programme) => [programme.id, programme]),
  );
  const programmesByLowerTitle = new Map<string, ProgrammeRecord[]>();

  for (const programme of programmes) {
    const key = programme.title.trim().toLowerCase();
    const current = programmesByLowerTitle.get(key) || [];
    current.push(programme);
    programmesByLowerTitle.set(key, current);
  }

  const preparedRows: PreparedRow[] = [];

  for (const row of csvRows) {
    const warnings: string[] = [];
    const errors: string[] = [];
    const existingUser = userMap.get(row.email) || null;

    if (!row.email || !EMAIL_REGEX.test(row.email)) {
      errors.push("Email is required and must be valid.");
    }

    const duplicateLines = emailToLines.get(row.email) || [];
    if (duplicateLines.length > 1) {
      errors.push(
        `Email appears multiple times in this CSV on lines ${duplicateLines.join(", ")}. Merge the student into one row.`,
      );
    }

    if (existingUser) {
      if (existingUser.role !== "STUDENT") {
        errors.push(
          `Existing account has role "${existingUser.role}", not STUDENT.`,
        );
      }

      if (existingUser.status !== "ACTIVE") {
        errors.push(
          `Existing account is "${existingUser.status}", not ACTIVE.`,
        );
      }

      if (!existingUser.password) {
        errors.push(
          "Existing student has no password set. Fix that account manually before reusing it in this import.",
        );
      }

      if (!row.name) {
        warnings.push(
          "Name was blank in the CSV, so the existing account name will be kept.",
        );
      } else if (
        existingUser.name &&
        existingUser.name.trim() &&
        existingUser.name.trim() !== row.name.trim()
      ) {
        warnings.push(
          `Existing account name is "${existingUser.name}". The import will keep the existing name instead of changing it.`,
        );
      }

      if (row.password) {
        warnings.push(
          "Password column is ignored for existing students. The import will not reset existing passwords.",
        );
      }
    } else {
      if (!row.name || row.name.trim().length < 2) {
        errors.push("Name is required for new students and must be at least 2 characters.");
      }

      if (row.password && row.password.length < 8) {
        errors.push("Provided passwords must be at least 8 characters.");
      }
    }

    if (row.programmeRefs.length === 0) {
      errors.push("At least one programme is required.");
    }

    const resolvedProgrammes: ProgrammeRecord[] = [];
    for (const reference of row.programmeRefs) {
      const resolution = resolveProgramme(
        reference,
        programmesById,
        programmesByLowerTitle,
      );

      if (resolution.error) {
        errors.push(resolution.error);
        continue;
      }

      if (!resolution.programme) {
        continue;
      }

      resolvedProgrammes.push(resolution.programme);
    }

    const uniqueProgrammes: ProgrammeRecord[] = [];
    const seenProgrammeIds = new Set<string>();
    for (const programme of resolvedProgrammes) {
      if (seenProgrammeIds.has(programme.id)) {
        warnings.push(
          `Programme "${programme.title}" was listed more than once and will only be applied once.`,
        );
        continue;
      }

      seenProgrammeIds.add(programme.id);
      uniqueProgrammes.push(programme);
    }

    preparedRows.push({
      action:
        errors.length > 0
          ? "none"
          : existingUser
            ? "reuse_existing_student"
            : "create_student",
      email: row.email,
      error: errors.length > 0 ? errors.join(" ") : null,
      existingUser,
      lineNumber: row.lineNumber,
      missingProgrammeIds: [],
      missingProgrammes: [],
      name: row.name,
      password: row.password,
      passwordMode: existingUser
        ? row.password
          ? "ignored_for_existing_user"
          : "none"
        : row.password
          ? "provided"
          : "auto_generated",
      programmeRefs: row.programmeRefs,
      raw: row,
      resolvedProgrammes: uniqueProgrammes,
      warnings,
    });
  }

  const enrolmentCheckRows = preparedRows.filter(
    (row) =>
      !row.error &&
      row.existingUser &&
      row.resolvedProgrammes.length > 0,
  );

  const existingEnrollments =
    enrolmentCheckRows.length === 0
      ? []
      : await prisma.courseEnrollment.findMany({
          where: {
            courseId: {
              in: dedupe(
                enrolmentCheckRows.flatMap((row) =>
                  row.resolvedProgrammes.map((programme) => programme.id),
                ),
              ),
            },
            userId: {
              in: dedupe(
                enrolmentCheckRows
                  .map((row) => row.existingUser?.id || "")
                  .filter((value) => value.length > 0),
              ),
            },
          },
          select: {
            courseId: true,
            userId: true,
          },
        });

  const enrollmentSet = new Set(
    existingEnrollments.map(
      (enrollment) => `${enrollment.userId}:${enrollment.courseId}`,
    ),
  );

  for (const row of preparedRows) {
    if (row.error || !row.existingUser) {
      row.missingProgrammes = [...row.resolvedProgrammes];
      row.missingProgrammeIds = row.missingProgrammes.map(
        (programme) => programme.id,
      );
      continue;
    }

    const missingProgrammes = row.resolvedProgrammes.filter(
      (programme) =>
        !enrollmentSet.has(`${row.existingUser?.id}:${programme.id}`),
    );
    const alreadyEnrolled = row.resolvedProgrammes.filter(
      (programme) =>
        enrollmentSet.has(`${row.existingUser?.id}:${programme.id}`),
    );

    if (alreadyEnrolled.length > 0) {
      row.warnings.push(
        `Already enrolled in: ${alreadyEnrolled
          .map((programme) => programme.title)
          .join(", ")}.`,
      );
    }

    row.missingProgrammes = missingProgrammes;
    row.missingProgrammeIds = missingProgrammes.map((programme) => programme.id);
  }

  return preparedRows;
}

function buildInitialResults(preparedRows: PreparedRow[], sendEmails: boolean) {
  return preparedRows.map<ResultRow>((row) => ({
    credentialPassword: null,
    email: row.email,
    emailPlanned:
      sendEmails &&
      row.action === "create_student" &&
      row.error === null,
    emailSent: null,
    enrollmentsAlreadyPresent:
      row.error || !row.existingUser
        ? 0
        : row.resolvedProgrammes.length - row.missingProgrammes.length,
    enrollmentsCreated: 0,
    error: row.error,
    lineNumber: row.lineNumber,
    name: row.existingUser?.name || row.name,
    outcome:
      row.error
        ? "error"
        : "dry_run",
    passwordMode: row.passwordMode,
    plannedAction: row.action,
    requestedProgrammeRefs: [...row.programmeRefs],
    resolvedProgrammeIds: row.resolvedProgrammes.map((programme) => programme.id),
    resolvedProgrammeTitles: row.resolvedProgrammes.map(
      (programme) => programme.title,
    ),
    userId: row.existingUser?.id || null,
    warnings: [...row.warnings],
  }));
}

async function runApply(
  preparedRows: PreparedRow[],
  resultRows: ResultRow[],
  options: CliOptions,
  absoluteCsvPath: string,
  runId: string,
) {
  const {
    createAuditLog,
    createAuditLogs,
    generateSecurePassword,
    prisma,
    sendUserCreatedEmail,
  } = await getSharedModules();
  let createdUsers = 0;
  let reusedUsers = 0;
  let enrollmentsCreated = 0;
  let emailsAttempted = 0;
  let emailsSucceeded = 0;
  let emailsFailed = 0;

  for (let index = 0; index < preparedRows.length; index += 1) {
    const row = preparedRows[index];
    const result = resultRows[index];

    if (row.error) {
      continue;
    }

    try {
      if (row.action === "reuse_existing_student" && row.existingUser) {
        reusedUsers += 1;

        if (row.missingProgrammes.length === 0) {
          result.outcome = "already_enrolled";
          result.userId = row.existingUser.id;
          continue;
        }

        const createdEnrollments = await prisma.$transaction(
          row.missingProgrammes.map((programme) =>
            prisma.courseEnrollment.create({
              data: {
                courseId: programme.id,
                status: "ACTIVE",
                userId: row.existingUser?.id || "",
              },
              include: {
                course: {
                  select: {
                    title: true,
                  },
                },
              },
            }),
          ),
        );

        await createAuditLogs(
          createdEnrollments.map((enrollment) => ({
            action: "ENROLLMENT_CREATED" as const,
            entityId: enrollment.id,
            entityType: "CourseEnrollment",
            metadata: {
              csvLine: row.lineNumber,
              importRunId: runId,
              operator: options.operator,
              programmeTitle: enrollment.course.title,
              source: IMPORT_SOURCE,
              sourceFile: path.basename(absoluteCsvPath),
              targetUserId: row.existingUser?.id,
            },
          })),
        );

        enrollmentsCreated += createdEnrollments.length;
        result.enrollmentsCreated = createdEnrollments.length;
        result.outcome = "enrolled_existing_user";
        result.userId = row.existingUser.id;
        continue;
      }

      if (row.action === "create_student") {
        const password =
          row.password.trim().length > 0
            ? row.password
            : generateSecurePassword();

        const hashedPassword = await hash(password, 12);
        const created = await prisma.$transaction(async (transaction) => {
          const user = await transaction.user.create({
            data: {
              email: row.email,
              name: row.name.trim(),
              password: hashedPassword,
              role: "STUDENT",
              status: "ACTIVE",
            },
            select: {
              email: true,
              id: true,
              name: true,
              role: true,
              status: true,
            },
          });

          const createdEnrollments = await Promise.all(
            row.missingProgrammes.map((programme) =>
              transaction.courseEnrollment.create({
                data: {
                  courseId: programme.id,
                  status: "ACTIVE",
                  userId: user.id,
                },
                include: {
                  course: {
                    select: {
                      title: true,
                    },
                  },
                },
              }),
            ),
          );

          return {
            createdEnrollments,
            user,
          };
        });

        await createAuditLog({
          action: "USER_CREATED",
          entityId: created.user.id,
          entityType: "User",
          metadata: {
            csvLine: row.lineNumber,
            email: created.user.email,
            importRunId: runId,
            operator: options.operator,
            role: created.user.role,
            source: IMPORT_SOURCE,
            sourceFile: path.basename(absoluteCsvPath),
          },
        });

        await createAuditLogs(
          created.createdEnrollments.map((enrollment) => ({
            action: "ENROLLMENT_CREATED" as const,
            entityId: enrollment.id,
            entityType: "CourseEnrollment",
            metadata: {
              csvLine: row.lineNumber,
              importRunId: runId,
              operator: options.operator,
              programmeTitle: enrollment.course.title,
              source: IMPORT_SOURCE,
              sourceFile: path.basename(absoluteCsvPath),
              targetUserId: created.user.id,
            },
          })),
        );

        createdUsers += 1;
        enrollmentsCreated += created.createdEnrollments.length;
        result.enrollmentsCreated = created.createdEnrollments.length;
        result.credentialPassword = password;
        result.outcome = "created_and_enrolled";
        result.userId = created.user.id;

        if (options.sendEmails) {
          emailsAttempted += 1;
          const emailResult = await sendUserCreatedEmail(
            created.user.email,
            {
              createdBy: options.operator,
              email: created.user.email,
              name: created.user.name || created.user.email,
              password,
              role: "STUDENT",
            },
            created.user.id,
          );

          result.emailSent = emailResult.success;

          if (emailResult.success) {
            emailsSucceeded += 1;
          } else {
            emailsFailed += 1;
            result.warnings.push(
              `Welcome email failed: ${emailResult.error || "unknown error"}.`,
            );
          }
        }

        resultRows[index] = {
          ...result,
          name: created.user.name || result.name,
          userId: created.user.id,
          warnings: [...result.warnings],
        };
      }
    } catch (error) {
      result.error =
        error instanceof Error ? error.message : "Unknown import error";
      result.outcome = "error";
    }
  }

  return {
    createdUsers,
    emailsAttempted,
    emailsFailed,
    emailsSucceeded,
    enrollmentsCreated,
    reusedUsers,
  };
}

async function writeReports(
  outputDir: string,
  preparedRows: PreparedRow[],
  resultRows: ResultRow[],
  summary: Omit<ImportSummary, "reportFiles">,
) {
  const absoluteOutputDir = path.resolve(outputDir);
  await fs.mkdir(absoluteOutputDir, { recursive: true });

  const summaryPath = path.join(absoluteOutputDir, "summary.json");
  const resultsJsonPath = path.join(absoluteOutputDir, "results.json");
  const resultsCsvPath = path.join(absoluteOutputDir, "results.csv");
  const credentialsCsvPath = path.join(absoluteOutputDir, "credentials.csv");

  const reportFiles: ImportSummary["reportFiles"] = {
    resultsCsv: resultsCsvPath,
    resultsJson: resultsJsonPath,
    summaryJson: summaryPath,
  };

  const credentialRows = preparedRows
    .map((row, index) => ({ result: resultRows[index], row }))
    .filter(
      ({ result, row }) =>
        result.outcome === "created_and_enrolled" &&
        row.action === "create_student",
    )
    .map(({ result, row }) => ({
      email: result.email,
      email_sent: result.emailSent === null ? "" : `${result.emailSent}`,
      name: result.name,
      password: result.credentialPassword || row.password,
      programme_titles: result.resolvedProgrammeTitles.join(" | "),
      user_id: result.userId || "",
    }));

  const finalSummary: ImportSummary = {
    ...summary,
    reportFiles:
      credentialRows.length > 0
        ? { ...reportFiles, credentialsCsv: credentialsCsvPath }
        : reportFiles,
  };

  await fs.writeFile(summaryPath, JSON.stringify(finalSummary, null, 2));
  await fs.writeFile(
    resultsJsonPath,
    JSON.stringify(
      {
        rows: resultRows,
        summary: finalSummary,
      },
      null,
      2,
    ),
  );

  const resultsCsvHeader = [
    "line_number",
    "email",
    "name",
    "planned_action",
    "outcome",
    "user_id",
    "requested_programme_refs",
    "resolved_programme_ids",
    "resolved_programme_titles",
    "enrollments_created",
    "enrollments_already_present",
    "email_planned",
    "email_sent",
    "password_mode",
    "warnings",
    "error",
  ];

  const resultsCsvLines = [
    resultsCsvHeader.join(","),
    ...resultRows.map((row) =>
      [
        row.lineNumber,
        row.email,
        row.name,
        row.plannedAction,
        row.outcome,
        row.userId || "",
        row.requestedProgrammeRefs.join(" | "),
        row.resolvedProgrammeIds.join(" | "),
        row.resolvedProgrammeTitles.join(" | "),
        row.enrollmentsCreated,
        row.enrollmentsAlreadyPresent,
        row.emailPlanned,
        row.emailSent === null ? "" : row.emailSent,
        row.passwordMode,
        row.warnings.join(" | "),
        row.error || "",
      ]
        .map((value) => escapeCsv(value))
        .join(","),
    ),
  ];

  await fs.writeFile(resultsCsvPath, `${resultsCsvLines.join("\n")}\n`, "utf8");

  if (credentialRows.length > 0) {
    const credentialsHeader = [
      "name",
      "email",
      "password",
      "programme_titles",
      "email_sent",
      "user_id",
    ];

    const credentialLines = [
      credentialsHeader.join(","),
      ...credentialRows.map((row) =>
        [
          row.name,
          row.email,
          row.password,
          row.programme_titles,
          row.email_sent,
          row.user_id,
        ]
          .map((value) => escapeCsv(value))
          .join(","),
      ),
    ];

    await fs.writeFile(
      credentialsCsvPath,
      `${credentialLines.join("\n")}\n`,
      "utf8",
    );
  }

  return finalSummary;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (options.writeTemplatePath) {
    await writeTemplate(options.writeTemplatePath);
    return;
  }

  if (options.listProgrammes) {
    await listProgrammes();
    return;
  }

  if (!options.csvPath) {
    printHelp();
    throw new Error("A CSV file is required. Pass --csv <path>.");
  }

  if (options.apply) {
    ensureApplyPreflight(options.sendEmails);
  } else {
    requireEnv("DATABASE_URL");
  }

  const startedAt = new Date();
  const runId = startedAt.toISOString().replace(/[:.]/g, "-");
  const outputDir =
    options.outputDir ||
    path.join(".artifacts", "bulk-student-import", runId);

  const { absoluteCsvPath, rows } = await parseCsv(options.csvPath);
  const preparedRows = await prepareRows(rows);
  const resultRows = buildInitialResults(preparedRows, options.sendEmails);
  const preflightErrors = resultRows.filter((row) => row.outcome === "error").length;

  if (preflightErrors > 0 && options.apply) {
    console.error(
      `Preflight failed with ${preflightErrors} row error(s). No database changes were made.`,
    );
  }

  let applyMetrics = {
    createdUsers: 0,
    emailsAttempted: 0,
    emailsFailed: 0,
    emailsSucceeded: 0,
    enrollmentsCreated: 0,
    reusedUsers: 0,
  };

  if (options.apply && preflightErrors === 0) {
    applyMetrics = await runApply(
      preparedRows,
      resultRows,
      options,
      absoluteCsvPath,
      runId,
    );
  }

  const endedAt = new Date();
  const finalSummary = await writeReports(outputDir, preparedRows, resultRows, {
    applyRequested: options.apply,
    csvPath: absoluteCsvPath,
    durationMs: endedAt.getTime() - startedAt.getTime(),
    emailFailures: applyMetrics.emailsFailed,
    emailsAttempted: applyMetrics.emailsAttempted,
    emailsSkipped:
      options.sendEmails || !options.apply
        ? 0
        : preparedRows.filter((row) => row.action === "create_student" && !row.error)
            .length,
    emailsSucceeded: applyMetrics.emailsSucceeded,
    endedAt: endedAt.toISOString(),
    newUsersCreated: applyMetrics.createdUsers,
    operator: options.operator,
    outputDir: path.resolve(outputDir),
    preflightErrors,
    readyRows: preparedRows.filter((row) => !row.error).length,
    rowsAlreadyEnrolled: resultRows.filter(
      (row) => row.outcome === "already_enrolled",
    ).length,
    rowsProcessed: resultRows.filter((row) => row.outcome !== "dry_run").length,
    rowsWithErrors: resultRows.filter((row) => row.outcome === "error").length,
    sendEmails: options.sendEmails,
    startedAt: startedAt.toISOString(),
    totalEnrollmentsCreated: applyMetrics.enrollmentsCreated,
    totalRows: resultRows.length,
    usersReused: applyMetrics.reusedUsers,
  });

  console.log(`CSV: ${absoluteCsvPath}`);
  console.log(`Mode: ${options.apply ? "apply" : "dry-run"}`);
  console.log(`Rows: ${finalSummary.totalRows}`);
  console.log(`Preflight errors: ${finalSummary.preflightErrors}`);
  console.log(`New users created: ${finalSummary.newUsersCreated}`);
  console.log(`Existing users reused: ${finalSummary.usersReused}`);
  console.log(`Enrollments created: ${finalSummary.totalEnrollmentsCreated}`);
  console.log(`Rows already enrolled: ${finalSummary.rowsAlreadyEnrolled}`);
  console.log(`Email attempts: ${finalSummary.emailsAttempted}`);
  console.log(`Email failures: ${finalSummary.emailFailures}`);
  console.log(`Reports: ${finalSummary.outputDir}`);

  if (!options.apply && finalSummary.preflightErrors === 0) {
    console.log("Dry-run completed cleanly. Re-run with --apply to make changes.");
  }

  if (finalSummary.rowsWithErrors > 0 || finalSummary.emailFailures > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Bulk import failed.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    if (sharedModulesPromise) {
      const { prisma } = await sharedModulesPromise;
      await prisma.$disconnect();
    }
  });
