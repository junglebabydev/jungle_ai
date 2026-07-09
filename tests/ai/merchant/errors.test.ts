import { toToolFailure, toolOk } from "../../../src/ai/assistants/merchant/errors";
import { BadRequestError } from "../../../src/errors/domains/BadRequestError";
import { AuthError } from "../../../src/errors/domains/AuthError";

describe("agent/errors: ApplicationError → tool result", () => {
  it("toolOk wraps data", () => {
    expect(toolOk({ a: 1 })).toEqual({ ok: true, data: { a: 1 } });
  });

  it("maps a ZodError (BR_023) into missingRequired the model can ask for", () => {
    const f = toToolFailure(
      BadRequestError.ZodError(["name required", "price required"]),
    );
    expect(f.ok).toBe(false);
    expect(f.code).toBe("BR_023");
    expect(f.missingRequired).toEqual(["name required", "price required"]);
  });

  it("relays a non-validation error faithfully, no missingRequired", () => {
    const f = toToolFailure(AuthError.Forbidden);
    expect(f.code).toBe("ATH_005");
    expect(f.missingRequired).toBeUndefined();
  });
});
