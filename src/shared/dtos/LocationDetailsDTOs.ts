import { LocationDetails } from "@prisma/client";

export type LocationDetailsResponseDTO = {
  id: number;
  // locationId omitted: this object is always nested under its location, so the
  // parent's id makes it redundant.
  description: string;
  termsSummary?: string | null;
  termsUrl?: string | null;
  bookingUrl?: string | null;
  webUrl?: string | null;
  email?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  phone?: string | null;
  whatsApp?: string | null;
  // The pre-booking questions the catalogue previously had no answer for. Null means
  // the venue has not said — never assume a policy from a blank.
  parking?: string | null;
  whatToBring?: string | null;
  supervisionPolicy?: string | null;
  amenities?: string | null;
};

export function mapLocationDetailsResponseDTO(
  details: LocationDetails,
): LocationDetailsResponseDTO {
  const mapped: LocationDetailsResponseDTO = {
    id: details.id,
    description: details.description,
    termsSummary: details.termsSummary,
    termsUrl: details.termsUrl,
    bookingUrl: details.bookingUrl,
    webUrl: details.webUrl,
    email: details.email,
    instagramUrl: details.instagramUrl,
    facebookUrl: details.facebookUrl,
    phone: details.phone,
    whatsApp: details.whatsApp,
    parking: details.parking,
    whatToBring: details.whatToBring,
    supervisionPolicy: details.supervisionPolicy,
    amenities: details.amenities,
  };

  return mapped;
}
