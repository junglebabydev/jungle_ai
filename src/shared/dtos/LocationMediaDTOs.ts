import { LocationMedia, MimeType } from "@prisma/client";

export type LocationMediaResponseDTO = {
  id: number;
  locationId: number;
  url: string;
  mimeType: MimeType;
  sequence?: number | null;
};

export function mapLocationMediaResponseDTO(
  media: LocationMedia,
): LocationMediaResponseDTO {
  const mapped: LocationMediaResponseDTO = {
    id: media.id,
    locationId: media.locationId,
    url: media.url,
    mimeType: media.mimeType,
    sequence: media.sequence,
  };

  return mapped;
}
