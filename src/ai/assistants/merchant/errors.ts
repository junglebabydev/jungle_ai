/**
 * Maps a thrown `ApplicationError` into the structured tool-result shape the
 * agent expects: `{ ok: false, code, message, missingRequired? }`. This is the
 * in-process equivalent of the MCP's `api/errors.ts` — instead of mapping an
 * HTTP error envelope, it relays booking_system's typed error (`status` = the
 * stable code, e.g. "BR_023") faithfully, so the model's "ask for the missing
 * field" behaviour is unchanged. The model is prompted never to surface the raw
 * code/message to the merchant; it interprets them.
 */

import ApplicationError from "../../../errors/ApplicationError";

export type ToolFailure = {
  ok: false;
  code: string;
  message: string;
  missingRequired?: string[];
};

export type ToolSuccess = {
  ok: true;
  data: unknown;
};

export type ToolResult = ToolSuccess | ToolFailure;

/** The validation error code + message prefix from BadRequestError.ZodError. */
const ZOD_ERROR_CODE = "BR_023";
const ZOD_MESSAGE_PREFIX = "Error validating DTO!";

/** Wrap a successful tool result. */
export function toolOk(data: unknown): ToolSuccess {
  return { ok: true, data };
}

/** Faithfully relay a typed booking_system error as a tool failure. */
export function toToolFailure(e: ApplicationError): ToolFailure {
  const missingRequired =
    e.status === ZOD_ERROR_CODE ? parseValidationIssues(e.message) : undefined;

  return {
    ok: false,
    code: e.status,
    message: e.message,
    ...(missingRequired ? { missingRequired } : {}),
  };
}

/**
 * ZodError messages arrive as `"Error validating DTO! msg1, msg2"`. Split them
 * back into individual issue strings so the agent knows what to ask next.
 * Best-effort: if the format changes, the full `message` is still relayed.
 */
function parseValidationIssues(message: string): string[] | undefined {
  const trimmed = message.startsWith(ZOD_MESSAGE_PREFIX)
    ? message.slice(ZOD_MESSAGE_PREFIX.length)
    : message;
  const issues = trimmed
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return issues.length > 0 ? issues : undefined;
}
