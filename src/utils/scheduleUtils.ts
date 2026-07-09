import { Schedule, SCHEDULE_TYPE } from "@prisma/client";
import { startOfDay, addDays, isSameDay } from "date-fns";

export type SchedulePattern = Pick<
  Schedule,
  | "scheduleType"
  | "dayOfWeek"
  | "startTime"
  | "endTime"
  | "rangeStartDate"
  | "rangeEndDate"
  | "excludedDates"
>;

export type ScheduleOccurence = {
  date: Date;
  startTime: string;
  endTime: string;
};

function expandRecurringScheduleToDates(
  pattern: SchedulePattern,
  from: Date,
  to: Date
): ScheduleOccurence[] {
  const windowStart = startOfDay(from);
  const windowEnd = startOfDay(to);

  if (windowEnd < windowStart) return [];

  if (
    pattern.scheduleType !== SCHEDULE_TYPE.RECURRING &&
    pattern.scheduleType !== SCHEDULE_TYPE.DATE_RANGE
  )
    return [];

  if (
    pattern.dayOfWeek === null ||
    pattern.startTime === null ||
    pattern.endTime === null
  )
    return [];

  let effectiveStart = windowStart;
  let effectiveEnd = windowEnd;

  if (pattern.rangeStartDate) {
    const rangeStart = startOfDay(pattern.rangeStartDate);
    if (rangeStart > effectiveStart) effectiveStart = rangeStart;
  }

  if (pattern.rangeEndDate) {
    const rangeEnd = startOfDay(pattern.rangeEndDate);
    if (rangeEnd < effectiveEnd) effectiveEnd = rangeEnd;
  }

  if (effectiveEnd < effectiveStart) return [];

  const { dayOfWeek: targetDow } = pattern;
  const occurences: ScheduleOccurence[] = [];

  let cursor = startOfDay(effectiveStart);

  while (cursor <= effectiveEnd && cursor.getDay() !== targetDow) {
    cursor = addDays(cursor, 1);
  }

  while (cursor <= effectiveEnd) {
    const isExcluded =
      pattern.excludedDates &&
      pattern.excludedDates.some((d) => isSameDay(d, cursor));

    if (!isExcluded)
      occurences.push({
        date: cursor,
        startTime: pattern.startTime,
        endTime: pattern.endTime,
      });

    cursor = addDays(cursor, 7);
  }

  return occurences;
}

export const ScheduleUtils = {
  expandRecurringScheduleToDates,
};
