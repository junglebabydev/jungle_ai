import { SCHEDULE_STATUS } from "@prisma/client";
import { ServiceLocator } from "../../../../services";
import { PERMISSIONS_MAP } from "../../../../shared/constants";
import {
  CreateScheduleSchema,
  UpdateScheduleSchema,
} from "../../../../shared/dtos/ScheduleDTOs";
import { defineTool } from "./types";
import { id, dataPayload, coerceNumericData, parseDto } from "./common";
import { resolveLocationId } from "../location";

export const upsertSchedule = defineTool({
  name: "upsert_schedule",
  description:
    "Add or edit a schedule for a product (recurring, fixed-date, or date-range). Omit scheduleId to create; include it to edit. On EDIT only capacity, status, and room are changeable — a schedule's day/time/date/type are fixed once created. `data.status` may be " +
    Object.values(SCHEDULE_STATUS).join(" | ") +
    " (set FULL to mark a session at capacity, CANCELLED to retire it). Capacity (maxCapacity) must be a whole number 1 or greater. Dates/times come from the merchant — never invent them. Put schedule fields in `data`.",
  input: { productId: id, scheduleId: id.optional(), data: dataPayload },
  requiredPermissions: (args) =>
    args.scheduleId !== undefined
      ? [PERMISSIONS_MAP.SCHEDULE_UPDATE.code]
      : [PERMISSIONS_MAP.SCHEDULE_CREATE.code],
  sensitive: true, // every write is gated — merchant confirms each change on a card
  handler: async (args, scope) => {
    const data = coerceNumericData(args.data) as Record<string, unknown>;
    if (args.scheduleId !== undefined) {
      return ServiceLocator.ScheduleService.public.updateSchedule(
        args.scheduleId,
        args.productId,
        parseDto(UpdateScheduleSchema, data),
      );
    }
    // Create goes through the orchestrator (schedule + initial sessions), exactly
    // like the HTTP POST /schedules route. Use the pinned location when present,
    // else the merchant's sole location (merchant-scoped conversation).
    return ServiceLocator.ScheduleSessionOrchestrator.public.createScheduleWithInitialSessions(
      args.productId,
      await resolveLocationId(scope),
      parseDto(CreateScheduleSchema, data),
    );
  },
});
