import { HTTPS_STATUS_CODE } from "../../shared/enums";
import ApplicationError from "../ApplicationError";

export const BadRequestError = {
  SignUp: new ApplicationError(
    "BR_001",
    "Error signing up user!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  SingIn: new ApplicationError(
    "BR_002",
    "Error signing in!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  SingOut: new ApplicationError(
    "BR_003",
    "Error signing out!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  CreateAuthSession: new ApplicationError(
    "BR_004",
    "Error creating auth session!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  UpdateAuthSession: new ApplicationError(
    "BR_005",
    "Error updating auth session!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  FetchAuthSession: new ApplicationError(
    "BR_006",
    "Error fetching auth session!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  SingOutAuthSession: new ApplicationError(
    "BR_007",
    "Error signing out session!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  FetchUser: new ApplicationError(
    "BR_008",
    "Error fetching user!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  CreateUser: new ApplicationError(
    "BR_009",
    "Error creating user!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  CreateFirebaseUser: (errors?: string[]) =>
    new ApplicationError(
      "BR_010",
      `Error creating user with firebase! ${
        errors && errors.length ? errors.join(", ") : ""
      }`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  CreateMerchantUser: (errors?: string[]) =>
    new ApplicationError(
      "BR_011",
      `Error creating merchant_user! ${
        errors && errors.length ? errors.join(", ") : ""
      }`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  CreateLocationUser: (errors?: string[]) =>
    new ApplicationError(
      "BR_012",
      `Error creating location_user! ${
        errors && errors.length ? errors.join(", ") : ""
      }`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  FetchRole: new ApplicationError(
    "BR_013",
    "Error fetching role!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  UserProvisioning: (errors?: string[]) =>
    new ApplicationError(
      "BR_014",
      `Error creating user with provisions! ${
        errors && errors.length ? errors.join(", ") : ""
      }`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  FetchPlatformRole: new ApplicationError(
    "BR_015",
    "Error fetching platform role!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  FetchMerchantUser: new ApplicationError(
    "BR_016",
    "Error fetching merchant user!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  FetchMerchantRole: new ApplicationError(
    "BR_017",
    "Error fetching merchant role!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  FetchLocationUser: new ApplicationError(
    "BR_018",
    "Error fetching location user!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  FetchLocationRole: new ApplicationError(
    "BR_019",
    "Error fetching location role!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  CreateMerchant: new ApplicationError(
    "BR_109",
    "Error creating merchant!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  FetchMerchant: new ApplicationError(
    "BR_020",
    "Error fetching merchant!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  UpdateMerchant: new ApplicationError(
    "BR_066",
    "Error updating merchant!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  FetchLocaiton: new ApplicationError(
    "BR_021",
    "Error fetching location!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  CreateLocation: new ApplicationError(
    "BR_022",
    "Error creating location!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  UpdateLocation: new ApplicationError(
    "BR_067",
    "Error updating location!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  ZodError: (errors?: string[]) =>
    new ApplicationError(
      "BR_023",
      `Error validating DTO! ${
        errors && errors.length ? errors.join(", ") : ""
      }`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  UpdatePlatformRole: new ApplicationError(
    "BR_024",
    "Error updating user's platform role!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  FetchRolePermissionMapping: new ApplicationError(
    "BR_025",
    "Error fetching role-permission mapping",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  DeleteFirebaseUser: (uid: string) =>
    new ApplicationError(
      "BR_026",
      `Error deleting user with firebase uid: ${uid}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  FetchProduct: (by?: string) =>
    new ApplicationError(
      "BR_027",
      `Error fetching product ${by ? ` by ${by}` : "."}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  PublishProduct: new ApplicationError(
    "BR_028",
    "Error publishing product!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  ArchiveProduct: new ApplicationError(
    "BR_029",
    "Error archiving product!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  FetchProductCategory: (by?: string) =>
    new ApplicationError(
      "BR_030",
      `Error fetching product category ${by ? ` by ${by}` : "."}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  ArchiveProductCategory: new ApplicationError(
    "BR_031",
    "Error archiving product category!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  FetchClassDetails: (by?: string) =>
    new ApplicationError(
      "BR_032",
      `Error fetching class details ${by ? ` by ${by}` : "."}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  CreateClass: new ApplicationError(
    "BR_033",
    "Error creating class!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  CreateProduct: new ApplicationError(
    "BR_034",
    "Error creating product!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  CreateProductCategory: new ApplicationError(
    "BR_035",
    "Error creating product category!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  FetchPricing: (by?: string) =>
    new ApplicationError(
      "BR_036",
      `Error fetching pricing ${by ? ` by ${by}` : "."}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  CreatePricing: (errors?: string[]) =>
    new ApplicationError(
      "BR_037",
      `Error creating pricing! ${errors && errors.length ? errors.join(", ") : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  UpdatePricing: new ApplicationError(
    "BR_038",
    "Error updating pricing!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  FetchSchedule: (by?: string) =>
    new ApplicationError(
      "BR_039",
      `Error fetching schedule ${by ? ` by ${by}` : "."}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  CreateSchedule: new ApplicationError(
    "BR_040",
    "Error creating schedule!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  FetchSession: (by?: string) =>
    new ApplicationError(
      "BR_041",
      `Error fetching session ${by ? ` by ${by}` : "."}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  CreateSession: new ApplicationError(
    "BR_042",
    "Error creating session!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  UpdateSession: new ApplicationError(
    "BR_064",
    "Error updating session!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  CancelSession: new ApplicationError(
    "BR_043",
    "Error cancelling session!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  GenerateSessionsForSchedule: (errors?: string[]) =>
    new ApplicationError(
      "BR_044",
      `Error generating sessions for schedule! ${
        errors ? errors.join(", ") : ""
      }`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  FetchPackageTemplate: (by?: string) =>
    new ApplicationError(
      "BR_045",
      `Error fetching package template ${by ? `by ${by}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  CreatePackageTemplate: new ApplicationError(
    "BR_046",
    "Error creating package template",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  UpdatePackageTemplate: new ApplicationError(
    "BR_062",
    "Error updating package template!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  ArchivePackageTemplate: new ApplicationError(
    "BR_064",
    "Error archiving package template!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  FetchRegistration: (by?: string) =>
    new ApplicationError(
      "BR_047",
      `Error fetching registration ${by ? `by ${by}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  CreateRegistration: new ApplicationError(
    "BR_048",
    "Error creating registration",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  FetchPackage: (by?: string) =>
    new ApplicationError(
      "BR_049",
      `Error fetching package ${by ? `by ${by}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  CreatePackage: new ApplicationError(
    "BR_050",
    "Error creating package",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  FetchStudent: (by?: string) =>
    new ApplicationError(
      "BR_051",
      `Error fetching student ${by ? `by ${by}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  CreateStudent: new ApplicationError(
    "BR_052",
    "Error creating student",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  ArchiveStudent: new ApplicationError(
    "BR_065",
    "Error archiving student",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  FetchBooking: (by?: string) =>
    new ApplicationError(
      "BR_053",
      `Error fetching booking ${by ? `by ${by}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  CreateBooking: new ApplicationError(
    "BR_054",
    "Error creating booking",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  FetchBookingStudent: (by?: string) =>
    new ApplicationError(
      "BR_055",
      `Error fetching booking student ${by ? `by ${by}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  CreateBookingStudent: new ApplicationError(
    "BR_056",
    "Error creating booking student",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  FetchSessionEnrollment: (by?: string) =>
    new ApplicationError(
      "BR_057",
      `Error fetching session enrollment ${by ? `by ${by}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  CreateSessionEnrollment: (errors?: string[]) =>
    new ApplicationError(
      "BR_058",
      `Error creating session enrollment! ${
        errors && errors.length ? errors.join(", ") : ""
      }`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  FetchAttendance: (by?: string) =>
    new ApplicationError(
      "BR_059",
      `Error fetching attendance ${by ? `by ${by}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  CreateAttendance: new ApplicationError(
    "BR_060",
    "Error creating attendance",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  FetchPackageCredit: (by?: string) =>
    new ApplicationError(
      "BR_061",
      `Error fetching package credit ${by ? `by ${by}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  CreatePackageCredit: new ApplicationError(
    "BR_062",
    "Error creating package credit",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  UpdateRegistration: (errors?: string[]) =>
    new ApplicationError(
      "BR_063",
      `Error updating registration! ${
        errors && errors.length ? errors.join(", ") : ""
      }`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  UpdateRegistrationStatus: (errors?: string[]) =>
    new ApplicationError(
      "BR_064",
      `Error updating registration status! ${
        errors && errors.length ? errors.join(", ") : ""
      }`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  UpsertAttendance: new ApplicationError(
    "BR_065",
    "Error upserting attendance!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  UpdateSessionEnrollment: new ApplicationError(
    "BR_066",
    "Error updating session enrollment",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  UpdateProduct: new ApplicationError(
    "BR_067",
    "Error updating product!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  UpdateClass: new ApplicationError(
    "BR_068",
    "Error updating class!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  UpdateSchedule: new ApplicationError(
    "BR_069",
    "Error updating schedule!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  MarkAttendance: (errors?: string[]) =>
    new ApplicationError(
      "BR_070",
      `Error marking attendance! ${
        errors && errors.length ? errors.join(", ") : ""
      }`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  UpdateStudent: new ApplicationError(
    "BR_071",
    "Error updating student!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  CancelSessionEnrollment: (errors?: string[]) =>
    new ApplicationError(
      "BR_072",
      `Error cancelling session enrollment! ${
        errors && errors.length ? errors.join(", ") : ""
      }`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  CreateProductMedia: new ApplicationError(
    "BR_073",
    "Error creating product media!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  FetchProductMedia: (by?: string) =>
    new ApplicationError(
      "BR_074",
      `Error fetching product media ${by ? `by ${by}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  UpdateProductMedia: new ApplicationError(
    "BR_075",
    `Error updating product media!`,
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  DeleteProductMedia: (by?: string) =>
    new ApplicationError(
      "BR_076",
      `Error deleting product media ${by ? `by ${by}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  CreateCampDetails: new ApplicationError(
    "BR_077",
    "Error creating camp details!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  FetchCampDetails: (by?: string) =>
    new ApplicationError(
      "BR_078",
      `Error fetching camp details ${by ? `by ${by}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  UpdateCampDetails: new ApplicationError(
    "BR_079",
    `Error updating camp details!`,
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  CreateCampOption: new ApplicationError(
    "BR_080",
    "Error creating option!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  FetchCampOption: (by?: string) =>
    new ApplicationError(
      "BR_081",
      `Error fetching camp option ${by ? `by ${by}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  UpdateCampOption: new ApplicationError(
    "BR_082",
    "Error updating camp option!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  CreateBirthdayDetails: new ApplicationError(
    "BR_083",
    "Error creating birthday details!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  FetchBirthdayDetails: (by?: string) =>
    new ApplicationError(
      "BR_084",
      `Error fetching birthday details ${by ? `by ${by}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  UpdateBirthdayDetails: new ApplicationError(
    "BR_085",
    `Error updating birthday details!`,
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  CreateBirthdayAddon: new ApplicationError(
    "BR_086",
    "Error creating birthday addon!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  FetchBirthdayAddon: (by?: string) =>
    new ApplicationError(
      "BR_087",
      `Error fetching birthday addon ${by ? `by ${by}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  UpdateBirthdayAddon: new ApplicationError(
    "BR_088",
    `Error updating birthday addon!`,
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  CreateBirthdayRequest: (errors?: string[]) =>
    new ApplicationError(
      "BR_089",
      `Error creating birthday request! ${
        errors && errors.length ? errors.join(", ") : ""
      }`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  FetchBirthdayRequest: (by?: string) =>
    new ApplicationError(
      "BR_090",
      `Error fetching birthday request ${by ? `by ${by}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  UpdateBirthdayRequest: (errors?: string[]) =>
    new ApplicationError(
      "BR_091",
      `Error updating birthday request! ${
        errors && errors.length ? errors.join(", ") : ""
      }`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  CreateBirthdayRequestAddon: new ApplicationError(
    "BR_092",
    "Error creating birthday request addon!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  FetchBirthdayRequestAddon: (by?: string) =>
    new ApplicationError(
      "BR_093",
      `Error fetching birthday request addon ${by ? `by ${by}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  DeleteBirthdayRequestAddon: (errors?: string[]) =>
    new ApplicationError(
      "BR_094",
      `Error deleting birthday request addon! ${
        errors && errors.length ? errors.join(", ") : ""
      }`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),

  CreateDropInDetails: new ApplicationError(
    "BR_095",
    "Error creating drop in details!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  FetchDropInDetails: (by?: string) =>
    new ApplicationError(
      "BR_096",
      `Error fetching drop in details ${by ? `by ${by}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  UpdateDropInDetails: new ApplicationError(
    "BR_097",
    `Error updating drop in details!`,
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),

  CreateDropInSchedule: (errors?: string[]) =>
    new ApplicationError(
      "BR_098",
      `Error creating drop in schedule! ${errors && errors.length ? errors.join(", ") : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  FetchDropInSchedule: (by?: string) =>
    new ApplicationError(
      "BR_099",
      `Error fetching drop in schedule ${by ? `by ${by}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  UpdateDropInSchedule: new ApplicationError(
    "BR_100",
    `Error updating drop in schedule!`,
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),

  CreateDropInRequest: (errors?: string[]) =>
    new ApplicationError(
      "BR_101",
      `Error creating drop in request! ${errors && errors.length ? errors.join(", ") : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  FetchDropInRequest: (by?: string) =>
    new ApplicationError(
      "BR_102",
      `Error fetching drop in request ${by ? `by ${by}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  UpdateDropInRequest: (errors?: string[]) =>
    new ApplicationError(
      "BR_103",
      `Error updating drop in request! ${errors && errors.length ? errors.join(", ") : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),

  CreateDropInRequestItem: (errors?: string[]) =>
    new ApplicationError(
      "BR_104",
      `Error creating drop in request item! ${errors && errors.length ? errors.join(", ") : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  FetchDropInRequestItem: (by?: string) =>
    new ApplicationError(
      "BR_105",
      `Error fetching drop in request item ${by ? `by ${by}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  UpdateDropInRequestItem: (errors?: string[]) =>
    new ApplicationError(
      "BR_106",
      `Error updating drop in request item! ${errors && errors.length ? errors.join(", ") : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  DeleteDropInRequestItem: (errors?: string[]) =>
    new ApplicationError(
      "BR_107",
      `Error deleting drop in request item! ${errors && errors.length ? errors.join(", ") : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  OrderByKeyNotAllowed: (key: string) =>
    new ApplicationError(
      "BR_108",
      `Order by key ${key} is not allowed!`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  WebhookSignatureInvalid: (reason?: string) =>
    new ApplicationError(
      "BR_110",
      `Webhook signature verification failed${reason ? `: ${reason}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  WebhookSecretNotConfigured: new ApplicationError(
    "BR_111",
    "Stripe webhook secret is not configured",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  ProcessStripeWebhook: (reason?: string) =>
    new ApplicationError(
      "BR_112",
      `Error processing Stripe webhook${reason ? `: ${reason}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  StartConnectOnboarding: (reason?: string) =>
    new ApplicationError(
      "BR_113",
      `Error starting Stripe Connect onboarding${reason ? `: ${reason}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  CreateConnectDashboardLink: (reason?: string) =>
    new ApplicationError(
      "BR_114",
      `Error creating Stripe Connect dashboard link${reason ? `: ${reason}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  ConnectOnboardingIncomplete: new ApplicationError(
    "BR_115",
    "Stripe Connect onboarding is not complete; dashboard link is unavailable until charges are enabled",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  UpsertMerchantStripeAccount: (reason?: string) =>
    new ApplicationError(
      "BR_116",
      `Error upserting Merchant Stripe Connect account${reason ? `: ${reason}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  CreateCheckoutSession: (reason?: string) =>
    new ApplicationError(
      "BR_117",
      `Error creating Stripe Checkout session${reason ? `: ${reason}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  SyncPaymentIntent: (reason?: string) =>
    new ApplicationError(
      "BR_118",
      `Error syncing Stripe payment intent${reason ? `: ${reason}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  ConnectAccountNotReady: new ApplicationError(
    "BR_119",
    "Merchant's Stripe Connect account is not ready to accept payments",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  SyncStripePayout: (reason?: string) =>
    new ApplicationError(
      "BR_120",
      `Error syncing Stripe payout${reason ? `: ${reason}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  SyncStripeDispute: (reason?: string) =>
    new ApplicationError(
      "BR_121",
      `Error syncing Stripe dispute${reason ? `: ${reason}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  CreateCustomerPortalSession: (reason?: string) =>
    new ApplicationError(
      "BR_122",
      `Error creating Stripe Customer Portal session${reason ? `: ${reason}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  CreateJungleSubscription: (reason?: string) =>
    new ApplicationError(
      "BR_123",
      `Error creating Jungle subscription${reason ? `: ${reason}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  JunglePlanInactive: new ApplicationError(
    "BR_124",
    "Selected Jungle plan is not active",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  JunglePlanYearlyUnavailable: new ApplicationError(
    "BR_125",
    "Selected Jungle plan does not offer yearly billing",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  JungleSubscriptionAlreadyExists: new ApplicationError(
    "BR_126",
    "Merchant already has an active Jungle subscription",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  SyncJungleSubscription: (reason?: string) =>
    new ApplicationError(
      "BR_127",
      `Error syncing Jungle subscription${reason ? `: ${reason}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  CreateJunglePortalSession: (reason?: string) =>
    new ApplicationError(
      "BR_128",
      `Error creating Jungle billing portal session${reason ? `: ${reason}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  UpsertMerchantSubscription: (reason?: string) =>
    new ApplicationError(
      "BR_129",
      `Error upserting merchant Jungle subscription${reason ? `: ${reason}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  ListJunglePlans: (reason?: string) =>
    new ApplicationError(
      "BR_130",
      `Error listing Jungle plans${reason ? `: ${reason}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  UpsertJungleInvoice: (reason?: string) =>
    new ApplicationError(
      "BR_131",
      `Error upserting Jungle invoice${reason ? `: ${reason}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  SyncJungleInvoice: (reason?: string) =>
    new ApplicationError(
      "BR_132",
      `Error syncing Jungle invoice${reason ? `: ${reason}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  FetchConnectPayments: (reason?: string) =>
    new ApplicationError(
      "BR_133",
      `Error fetching connect payments${reason ? `: ${reason}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  GetMerchantWebsite: new ApplicationError(
    "BR_134",
    "Error fetching merchant website!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  BootstrapMerchantWebsite: new ApplicationError(
    "BR_135",
    "Error bootstrapping merchant website from template!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  PublishMerchantWebsite: new ApplicationError(
    "BR_136",
    "Error publishing merchant website!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  UpdateMerchantWebsite: new ApplicationError(
    "BR_137",
    "Error updating merchant website draft!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  UnpublishMerchantWebsite: new ApplicationError(
    "BR_138",
    "Error unpublishing merchant website!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  DiscardMerchantWebsiteDraft: new ApplicationError(
    "BR_139",
    "Error discarding merchant website draft!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  PreviewMerchantWebsite: new ApplicationError(
    "BR_140",
    "Error building merchant website preview!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  CreateSitePage: new ApplicationError(
    "BR_141",
    "Error creating site page!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  UpdateSitePage: new ApplicationError(
    "BR_142",
    "Error updating site page!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  DeleteSitePage: new ApplicationError(
    "BR_143",
    "Error deleting site page!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  DeleteSystemPageForbidden: new ApplicationError(
    "BR_144",
    "System pages cannot be deleted",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  ReorderSitePages: new ApplicationError(
    "BR_145",
    "Error reordering site pages!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  DiscardDraftNoPublishedSnapshot: new ApplicationError(
    "BR_146",
    "Cannot discard draft: site has never been published",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  CreateSiteSectionComponent: new ApplicationError(
    "BR_147",
    "Error creating site section component!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  UpdateSiteSectionComponent: new ApplicationError(
    "BR_148",
    "Error updating site section component!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  DeleteSiteSectionComponent: new ApplicationError(
    "BR_149",
    "Error deleting site section component!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  ReorderSiteSectionComponents: new ApplicationError(
    "BR_150",
    "Error reordering site section components!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  GetPublicSite: new ApplicationError(
    "BR_151",
    "Error fetching public site!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  // BR_152 retired (was ArchiveUser; the archive-user endpoint was removed in
  // favor of hard-deleting the LocationUser membership row). Do not reuse.
  DeleteLocationUser: new ApplicationError(
    "BR_153",
    "Error deleting location user!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  TypesenseIndex: new ApplicationError(
    "BR_154",
    "Error indexing document in search engine!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  TypesenseSearch: new ApplicationError(
    "BR_155",
    "Error querying search engine!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  UploadMerchantMedia: (reasons?: string[]) =>
    new ApplicationError(
      "BR_156",
      `Error uploading merchant media!${
        reasons && reasons.length ? ` ${reasons.join(", ")}` : ""
      }`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  FetchMerchantMedia: (by?: string) =>
    new ApplicationError(
      "BR_157",
      `Error fetching merchant media!${by ? ` (${by})` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  DeleteMerchantMedia: (by?: string) =>
    new ApplicationError(
      "BR_158",
      `Error deleting merchant media!${by ? ` (${by})` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  UnsupportedMediaType: (mimeType?: string) =>
    new ApplicationError(
      "BR_159",
      `Unsupported media type!${mimeType ? ` (${mimeType})` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  MediaFileTooLarge: new ApplicationError(
    "BR_160",
    "Uploaded file exceeds the 5MB size limit!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  MediaFileRequired: new ApplicationError(
    "BR_161",
    "A file is required for upload!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  MerchantMediaQuotaExceeded: (detail?: string) =>
    new ApplicationError(
      "BR_162",
      `Merchant media storage quota exceeded!${detail ? ` ${detail}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  TooManyMediaFiles: new ApplicationError(
    "BR_163",
    "Too many files in a single upload (max 10)!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  UploadBlogMedia: (reasons?: string[]) =>
    new ApplicationError(
      "BR_183",
      `Error uploading blog media!${
        reasons && reasons.length ? ` ${reasons.join(", ")}` : ""
      }`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  UnsupportedProductType: (type?: string) =>
    new ApplicationError(
      "BR_164",
      `Product type${type ? ` ${type}` : ""} is not yet supported (no create route).`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),

  // Agent guardrail (model-facing message): the model interprets this and edits the
  // existing product instead of creating a duplicate. The merchant never sees it.
  /**
   * A price recorded under the wrong unit is worse than no price: the figure looks
   * right and means something else, and it is shown to parents that way. So the
   * agent is stopped and told to ask, rather than allowed to guess a unit.
   */
  ImplausiblePriceType: (
    priceType: string,
    productType: string,
    allowed: readonly string[],
  ) =>
    new ApplicationError(
      "BR_188",
      `A ${productType} cannot be priced as ${priceType} — that unit belongs to a different kind of product, and the figure would be shown to parents with the wrong meaning. Valid for a ${productType}: ${allowed.join(", ")}. Ask the merchant which one this price is, and do not guess.`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  DuplicateProductName: (name: string, id: number) =>
    new ApplicationError(
      "BR_169",
      `A product named "${name}" already exists (productId ${id}). To change it, EDIT that product by passing productId ${id} — do not create a duplicate. For a genuinely separate product, use a different name.`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  AiEvalLog: new ApplicationError(
    "BR_165",
    "Failed to write AI eval log!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  AiConversation: new ApplicationError(
    "BR_166",
    "AI conversation operation failed!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  AiPendingAction: new ApplicationError(
    "BR_167",
    "AI pending action operation failed!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  ConciergeConversation: new ApplicationError(
    "BR_182",
    "Concierge conversation operation failed!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  // Merchant-scoped AI chat: a location-specific action was attempted but no
  // single location could be resolved (the merchant has zero, or several and
  // none was pinned). The agent relays this in plain language to the merchant.
  AiLocationRequired: (detail?: string) =>
    new ApplicationError(
      "BR_168",
      `This action needs a specific location${detail ? ` — ${detail}` : ""}.`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),

  // --- AI Eval Report (from deploy-dev) ---
  CreateAiEvalReport: new ApplicationError(
    "BR_170",
    "Failed to store AI eval report!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  ListAiEvalReport: new ApplicationError(
    "BR_171",
    "Failed to list AI eval reports!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),

  // --- WhatsApp channel (Meta Cloud API) ---
  WhatsappConfigMissing: new ApplicationError(
    "BR_172",
    "WhatsApp is not configured!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  WhatsappSignatureInvalid: (reason?: string) =>
    new ApplicationError(
      "BR_173",
      `WhatsApp webhook signature invalid${reason ? `: ${reason}` : ""}!`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  CreateWhatsappLink: new ApplicationError(
    "BR_174",
    "Failed to create the WhatsApp link!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  RedeemWhatsappLink: new ApplicationError(
    "BR_175",
    "Failed to redeem the WhatsApp link code!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  WhatsappInboundJob: new ApplicationError(
    "BR_176",
    "WhatsApp inbound job operation failed!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  WhatsappSend: (detail?: string) =>
    new ApplicationError(
      "BR_177",
      `Failed to send the WhatsApp message!${detail ? ` ${detail}` : ""}`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  FetchWhatsappLink: new ApplicationError(
    "BR_178",
    "Failed to fetch the WhatsApp link status!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  DisconnectWhatsappLink: new ApplicationError(
    "BR_179",
    "Failed to disconnect the WhatsApp link!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),

  // --- Federated search (GET /search) ---
  SearchQueryRequired: new ApplicationError(
    "BR_180",
    "A search query is required!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  Search: new ApplicationError(
    "BR_181",
    "Search failed!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),

  // --- Notifications (email) ---
  SendEmail: new ApplicationError(
    "BR_184",
    "Failed to send email!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),

  // --- Reservation (public pre-booking) ---
  CreateReservation: (reasons?: string[]) =>
    new ApplicationError(
      "BR_185",
      `Failed to create the reservation!${
        reasons && reasons.length ? ` ${reasons.join(", ")}` : ""
      }`,
      HTTPS_STATUS_CODE.BAD_REQUEST,
    ),
  CampOptionUnavailable: new ApplicationError(
    "BR_186",
    "This camp option is not available for reservation!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
  CampOptionFull: new ApplicationError(
    "BR_187",
    "This camp option is fully booked!",
    HTTPS_STATUS_CODE.BAD_REQUEST,
  ),
} as const;
