import { LocationOperatingHrs } from "@prisma/client";

export type LocationOperatingHrsResponseDTO = {
  id: number;
  // locationId omitted: always nested under its location, so it's redundant.
  day: number;
  businessHrs?: string | null;
};

export function mapLocationOperatingHrsResponseDTO(
  operatingHrs: LocationOperatingHrs,
): LocationOperatingHrsResponseDTO {
  const mapped: LocationOperatingHrsResponseDTO = {
    id: operatingHrs.id,
    day: operatingHrs.day,
    businessHrs: operatingHrs.businessHrs,
  };

  return mapped;
}
