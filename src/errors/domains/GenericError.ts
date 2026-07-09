import { HTTPS_STATUS_CODE } from "../../shared/enums";
import ApplicationError from "../ApplicationError";

export const GenericError = {
  InternalServerError: new ApplicationError(
    "GE_001",
    "Somthing went wrong!",
    HTTPS_STATUS_CODE.INTERNAL_SERVER_ERROR
  ),
  MethodNotImplemented: new ApplicationError(
    "GE_002",
    "Method not implemented yet!",
    HTTPS_STATUS_CODE.INTERNAL_SERVER_ERROR
  ),
  TooManyRequests: new ApplicationError(
    "GE_003",
    "Too many requests — please slow down and try again shortly.",
    HTTPS_STATUS_CODE.TOO_MANY_REQUESTS
  ),
  SearchUnavailable: new ApplicationError(
    "GE_004",
    "Search is temporarily unavailable. Please try again in a moment.",
    HTTPS_STATUS_CODE.SERVICE_UNAVAILABLE
  ),
} as const;
