import {
  CreateScheduleDTO,
  ScheduleResponseDTO,
} from "../../shared/dtos/ScheduleDTOs";
import { SessionResponseDTO } from "../../shared/dtos/SessionDTOs";

export interface IScheduleSessionOrchestrator {
  createScheduleWithInitialSessions(
    productId: number,
    locationId: number,
    dto: CreateScheduleDTO
  ): Promise<ScheduleResponseDTO>;

  expandRecurringScheduleSessions(
    scheduleId: number,
    { days }: { days?: number }
  ): Promise<SessionResponseDTO[]>;
}
