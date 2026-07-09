import { ZodError } from "zod";
import ApplicationError from "../../errors/ApplicationError";
import { BadRequestError } from "../../errors/domains/BadRequestError";

/**
 * Map a ZodError to the canonical `BR_023` validation error. SINGLE source for
 * both the HTTP `validateBody` middleware and the in-process agent dispatcher /
 * tool handlers, so a validation failure produces an identical `{ code, message }`
 * (and the agent's missingRequired relay stays in lock-step with the API).
 */
export function mapZodError(e: ZodError): ApplicationError {
  return BadRequestError.ZodError(e.issues.map((i) => i.message));
}
