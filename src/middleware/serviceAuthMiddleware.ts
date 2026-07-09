import { NextFunction, Request, Response } from "express";
import { AuthError } from "../errors/domains/AuthError";

/**
 * Service-to-service auth — the trust boundary between booking_system and this
 * service. Every non-public endpoint requires the shared secret in the `x-api-key`
 * header, compared against `JUNGLE_AI_API_KEY`. booking's `aiClient` sends it on
 * every request. Read at call time so env is always current.
 *
 * The WhatsApp webhook is the ONE exception — Meta calls it directly (not via
 * booking) and it authenticates itself with an HMAC signature, so it is NOT
 * mounted behind this guard.
 */
export function serviceAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const expected = process.env.JUNGLE_AI_API_KEY;
    if (!expected) throw AuthError.Forbidden; // misconfigured server → deny
    const provided = req.header("x-api-key");
    if (!provided) throw AuthError.MissingToken("x-api-key");
    if (provided !== expected) throw AuthError.Forbidden;
    next();
  } catch (e) {
    next(e);
  }
}
