import { AuditAction, type Prisma } from "@/generated/prisma";

export interface ParsedActivityLogFilters {
  action: string;
  entityType: string;
  userId: string;
  search: string;
  startDate: Date | null;
  endDate: Date | null;
}

export const MAX_ACTIVITY_LOG_PAGE_LIMIT = 100;
export const ACTIVITY_LOG_EXPORT_BATCH_SIZE = 500;

const parseDateParam = (value: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const toPositiveInt = (value: string | null, fallback: number) => {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const isAuditAction = (value: string): value is AuditAction => {
  return Object.values(AuditAction).includes(value as AuditAction);
};

export const parseActivityLogFilters = (searchParams: URLSearchParams) => {
  const action = (searchParams.get("action") || "").trim();
  const entityType = (searchParams.get("entityType") || "").trim();
  const userId = (searchParams.get("userId") || "").trim();
  const search = (searchParams.get("search") || "").trim();
  const startDate = parseDateParam(searchParams.get("startDate"));
  const endDate = parseDateParam(searchParams.get("endDate"));

  if (searchParams.get("startDate") && !startDate) {
    return { error: "Invalid startDate parameter" } as const;
  }

  if (searchParams.get("endDate") && !endDate) {
    return { error: "Invalid endDate parameter" } as const;
  }

  if (action && !isAuditAction(action)) {
    return { error: "Invalid action parameter" } as const;
  }

  return {
    filters: {
      action,
      entityType,
      userId,
      search,
      startDate,
      endDate,
    },
  } as const;
};

export const buildActivityLogWhere = ({
  action,
  entityType,
  userId,
  search,
  startDate,
  endDate,
}: ParsedActivityLogFilters): Prisma.AuditLogWhereInput => {
  const where: Prisma.AuditLogWhereInput = {};

  if (action) {
    where.action = action as AuditAction;
  }

  if (entityType) {
    where.entityType = entityType;
  }

  if (userId) {
    where.userId = userId;
  }

  if (search) {
    const searchClauses: Prisma.AuditLogWhereInput[] = [
      { entityType: { contains: search, mode: "insensitive" } },
      { entityId: { contains: search, mode: "insensitive" } },
      { ipAddress: { contains: search, mode: "insensitive" } },
      {
        user: {
          is: {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      },
    ];

    const matchingActions = Object.values(AuditAction).filter((value) =>
      value.toLowerCase().includes(search.toLowerCase()),
    );

    if (matchingActions.length > 0) {
      searchClauses.push({ action: { in: matchingActions } });
    }

    where.OR = searchClauses;
  }

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) {
      where.createdAt.gte = startDate;
    }
    if (endDate) {
      const inclusiveEndDate = new Date(endDate);
      inclusiveEndDate.setHours(23, 59, 59, 999);
      where.createdAt.lte = inclusiveEndDate;
    }
  }

  return where;
};

export const buildActivityLogQueryParams = ({
  page,
  limit,
  search,
  action,
  entityType,
  userId,
  startDate,
  endDate,
}: {
  page?: number;
  limit?: number;
  search?: string;
  action?: string;
  entityType?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
}) => {
  const params = new URLSearchParams();

  if (page) params.set("page", page.toString());
  if (limit) params.set("limit", limit.toString());
  if (search?.trim()) params.set("search", search.trim());
  if (action?.trim()) params.set("action", action.trim());
  if (entityType?.trim()) params.set("entityType", entityType.trim());
  if (userId?.trim()) params.set("userId", userId.trim());
  if (startDate?.trim()) params.set("startDate", startDate.trim());
  if (endDate?.trim()) params.set("endDate", endDate.trim());

  return params;
};

export const escapeCsvCell = (value: unknown) => {
  const normalized =
    value === null || value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value);

  return `"${normalized.replace(/"/g, '""')}"`;
};
