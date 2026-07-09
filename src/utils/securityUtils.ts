import crypto from "crypto";

function generateHash(str: string, SALT?: string): string {
  const hash = crypto.createHash("sha256");
  hash.update(SALT ? SALT + str : str);
  return hash.digest("hex");
}

function decryptBase64(str: string) {
  return Buffer.from(str, "base64").toString("binary");
}

export const SecurityUtils = {
  generateHash,
  decryptBase64,
};
