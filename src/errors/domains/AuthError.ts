import { HTTPS_STATUS_CODE } from "../../shared/enums";
import ApplicationError from "../ApplicationError";

export const AuthError = {
  InvalidToken: new ApplicationError(
    "ATH_001",
    "The provided authentication token is invalid!",
    HTTPS_STATUS_CODE.UNAUTHORIZED
  ),
  MissingToken: (type: string) =>
    new ApplicationError(
      "ATH_002",
      `Missing ${type} token header!`,
      HTTPS_STATUS_CODE.UNAUTHORIZED
    ),
  InvalidEmail: new ApplicationError(
    "ATH_003",
    "The provided email is invalid!",
    HTTPS_STATUS_CODE.UNAUTHORIZED
  ),
  InvalidUser: new ApplicationError(
    "ATH_004",
    "Invalid user!",
    HTTPS_STATUS_CODE.UNAUTHORIZED
  ),
  Forbidden: new ApplicationError(
    "ATH_005",
    "Forbidden!",
    HTTPS_STATUS_CODE.FORBIDDEN
  ),
  AccessDenied: new ApplicationError(
    "ATH_006",
    "Access deinied!",
    HTTPS_STATUS_CODE.UNAUTHORIZED
  ),
  DuplicateUser: new ApplicationError(
    "ATH_007",
    "User already exists!",
    HTTPS_STATUS_CODE.UNAUTHORIZED
  ),
  DuplicateSession: new ApplicationError(
    "ATH_008",
    "Session already exists!",
    HTTPS_STATUS_CODE.UNAUTHORIZED
  ),
  LoggedOutSession: new ApplicationError(
    "ATH_009",
    "Session has been logged out.",
    HTTPS_STATUS_CODE.UNAUTHORIZED
  ),
  SubscriptionSuspended: new ApplicationError(
    "ATH_010",
    "Merchant Jungle subscription is suspended or canceled. Resolve billing to regain access.",
    HTTPS_STATUS_CODE.LOCKED
  ),
  PlanFeatureRequired: (featureKey: string) =>
    new ApplicationError(
      "ATH_011",
      `Feature '${featureKey}' is not available on the merchant's current Jungle plan.`,
      HTTPS_STATUS_CODE.FORBIDDEN
    ),
  PlanLimitReached: (limitKey: string, max: number) =>
    new ApplicationError(
      "ATH_012",
      `Plan limit reached for '${limitKey}' (max ${max}). Upgrade to continue.`,
      HTTPS_STATUS_CODE.FORBIDDEN
    ),
} as const;
