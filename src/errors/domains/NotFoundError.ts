import { HTTPS_STATUS_CODE } from "../../shared/enums";
import ApplicationError from "../ApplicationError";

export const NotFoundError = {
  AuthSession: new ApplicationError(
    "NF_001",
    "Auth session not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  User: new ApplicationError(
    "NF_002",
    "User not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  Role: new ApplicationError(
    "NF_003",
    "Role not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  Merchant: new ApplicationError(
    "NF_004",
    "Merchant not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  Location: new ApplicationError(
    "NF_005",
    "Location not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  Product: new ApplicationError(
    "NF_006",
    "Product not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  ProductCategory: new ApplicationError(
    "NF_007",
    "Product category not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  ClassDetails: new ApplicationError(
    "NF_008",
    "Class details not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  Pricing: new ApplicationError(
    "NF_009",
    "Pricing not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  Schedule: new ApplicationError(
    "NF_010",
    "Schedule not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  Session: new ApplicationError(
    "NF_011",
    "Session not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  PackageTemplate: new ApplicationError(
    "NF_012",
    "Package template not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  Registration: new ApplicationError(
    "NF_013",
    "Registration not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  Package: new ApplicationError(
    "NF_014",
    "Package not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  Student: new ApplicationError(
    "NF_015",
    "Student not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  Booking: new ApplicationError(
    "NF_016",
    "Booking not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  BookingStudent: new ApplicationError(
    "NF_017",
    "Booking student not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  SessionEnrollment: new ApplicationError(
    "NF_018",
    "Session enrollment not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  Attendance: new ApplicationError(
    "NF_019",
    "Attendance not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  PackageCredit: new ApplicationError(
    "NF_020",
    "Package credit not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  ProductMedia: new ApplicationError(
    "NF_021",
    "Product media not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  CampDetails: new ApplicationError(
    "NF_022",
    "Camp details not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  CampOption: new ApplicationError(
    "NF_023",
    "Camp option not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  BirthdayDetails: new ApplicationError(
    "NF_024",
    "Birthday details not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  BirthdayAddon: new ApplicationError(
    "NF_025",
    "Birthday addon not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  BirthdayRequest: new ApplicationError(
    "NF_026",
    "Birthday request not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  BirthdayRequestAddon: new ApplicationError(
    "NF_027",
    "Birthday request addon not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  DropIn: new ApplicationError(
    "NF_028",
    "Drop in not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  DropInSchedule: new ApplicationError(
    "NF_029",
    "Drop in schedule not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  DropInRequest: new ApplicationError(
    "NF_030",
    "Drop in request not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  DropInRequestItem: new ApplicationError(
    "NF_031",
    "Drop in request item not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  MerchantStripeAccount: new ApplicationError(
    "NF_032",
    "Merchant Stripe Connect account not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  JunglePlan: new ApplicationError(
    "NF_033",
    "Jungle plan not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  MerchantSubscription: new ApplicationError(
    "NF_034",
    "Merchant Jungle subscription not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  MerchantSiteConfig: new ApplicationError(
    "NF_035",
    "Merchant site config not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  SitePage: new ApplicationError(
    "NF_036",
    "Site page not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  SiteSection: new ApplicationError(
    "NF_037",
    "Site section not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  SiteSectionComponent: new ApplicationError(
    "NF_038",
    "Site section component not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  PublicSite: new ApplicationError(
    "NF_039",
    "Public site not found or not published!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  LocationUser: new ApplicationError(
    "NF_040",
    "Location user not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  MerchantMedia: new ApplicationError(
    "NF_041",
    "Merchant media not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  AiConversation: new ApplicationError(
    "NF_042",
    "AI conversation not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  AiPendingAction: new ApplicationError(
    "NF_043",
    "AI pending action not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  ConciergeConversation: new ApplicationError(
    "NF_045",
    "Concierge conversation not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
  WhatsappLink: new ApplicationError(
    "NF_044",
    "WhatsApp link not found!",
    HTTPS_STATUS_CODE.NOT_FOUND,
  ),
} as const;
