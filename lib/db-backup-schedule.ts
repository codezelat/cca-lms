export const DB_BACKUP_CRON = "17 0 * * *";
export const DB_BACKUP_SCHEDULE_DESCRIPTION = "Daily target 12:17 AM UTC";
export const DB_BACKUP_UTC_HOUR = 0;
export const DB_BACKUP_UTC_MINUTE = 17;
export const DB_BACKUP_SCHEDULE_GRACE_MINUTES = 120;

export function getNextDbBackupRun(now = new Date()) {
  const next = new Date(now);

  next.setUTCHours(DB_BACKUP_UTC_HOUR, DB_BACKUP_UTC_MINUTE, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next;
}

export function getMostRecentDbBackupSlot(now = new Date()) {
  const slot = new Date(now);

  slot.setUTCHours(DB_BACKUP_UTC_HOUR, DB_BACKUP_UTC_MINUTE, 0, 0);
  if (slot.getTime() > now.getTime()) {
    slot.setUTCDate(slot.getUTCDate() - 1);
  }

  return slot;
}

export function getDbBackupSlotDeadline(slot: Date) {
  return new Date(slot.getTime() + DB_BACKUP_SCHEDULE_GRACE_MINUTES * 60 * 1000);
}
