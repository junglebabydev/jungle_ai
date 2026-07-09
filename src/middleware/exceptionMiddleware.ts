import { NextFunction, Response } from "express";
import ApplicationError from "../errors/ApplicationError";
import { HTTPS_STATUS_CODE } from "../shared/enums";
import { GenericError } from "../errors/domains/GenericError";
import { AuthenticatedRequest } from "../shared/types/authenticated-request";
import { basePostHogProps, getPostHog } from "../lib/posthog";

export function exceptionMiddleware(
  exc: ApplicationError,
  req: AuthenticatedRequest,
  res: Response,
  _next: NextFunction,
) {
  const statusCode =
    exc instanceof ApplicationError
      ? exc.statusCode
      : HTTPS_STATUS_CODE.INTERNAL_SERVER_ERROR;
  res.status(statusCode);

  const code = exc.status || GenericError.InternalServerError.status;
  const message = exc.message || GenericError.InternalServerError.message;

  // Stash the precise error for api-incident telemetry (apiIncident reads this in
  // res.on("finish")). The stack is server-side debug only — NEVER sent to client.
  res.locals.apiError = { code, message, stack: (exc as Error)?.stack };

  res.json({ code, message });

  // Error Tracking: capture 5xx as a proper PostHog exception (stack symbolication,
  // grouping into issues, alerting) — beyond the HTTP-level api_incident event. 4xx
  // (expected validation/auth denials) are intentionally NOT captured here so Error
  // Tracking stays free of routine denials. Deferred + buffered → never on the
  // response path; getPostHog() is null under tests, so this is a no-op there.
  if (statusCode >= HTTPS_STATUS_CODE.INTERNAL_SERVER_ERROR) {
    const client = getPostHog();
    if (client) {
      const hasUser = req.auth?.userId != null;
      const distinctId = hasUser
        ? `user-${req.auth!.userId}`
        : req.ip || "anonymous";
      // Severity drives how prominently it shows in Error Tracking (red). An
      // UNEXPECTED throw (non-ApplicationError = uncaught bug) is the most severe;
      // an explicit typed 5xx is a normal error.
      const level = exc instanceof ApplicationError ? "error" : "fatal";
      setImmediate(() => {
        try {
          client.captureException(exc, distinctId, {
            ...basePostHogProps(),
            source: "api",
            $exception_level: level,
            code,
            status: statusCode,
            method: req.method,
            route: req.route?.path,
            $current_url: req.originalUrl,
            merchantId: req.params?.merchantId,
            userId: req.auth?.userId,
            ...(hasUser ? {} : { $process_person_profile: false }),
          });
        } catch (e) {
          console.error(
            "[exception] captureException failed (non-fatal):",
            e instanceof Error ? e.message : String(e),
          );
        }
      });
    }
  }
}
