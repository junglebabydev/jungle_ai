import { Location } from "@prisma/client";
import {
  CreateLocationDTO,
  LocationResponseDTO,
  UpdateLocationDTO,
} from "../../shared/dtos/LocationDTOs";

export interface ILocationServiceInternal {
  findLocationById(id: string | number): Promise<Location | null>;
  /** Distinct, non-empty `sgDistrict` values across active locations — the raw
   *  vocabulary the concierge query parser turns into district matchers. */
  getDistinctDistricts(): Promise<string[]>;
}

export interface ILocationService {
  createLocation(dto: CreateLocationDTO): Promise<LocationResponseDTO>;
  getLocationById(
    id: string | number,
    {
      withMerchant,
      withDetails,
      withOperatingHrs,
      withMedia,
    }: {
      withMerchant?: boolean;
      withDetails?: boolean;
      withOperatingHrs?: boolean;
      withMedia?: boolean;
    },
  ): Promise<LocationResponseDTO>;
  updateLocation(
    id: string | number,
    dto: UpdateLocationDTO,
  ): Promise<LocationResponseDTO>;
  archiveLocation(id: string | number): Promise<LocationResponseDTO>;
}
