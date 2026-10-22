import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { config } from "./config.ts";
export const token = () => randomBytes(32).toString("hex");
export const hash = (v: string) => createHash("sha256").update(v).digest("hex");
function encryptionKey() {
  const key = process.env.ENCRYPTION_KEY || "";
  if (!/^[a-f0-9]{64}$/i.test(key))
    throw new Error("کلید رمزگذاری سرور تنظیم نشده است.");
  return Buffer.from(key, "hex");
}
export function seal(value: any) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    iv.toString("hex"),
    cipher.getAuthTag().toString("hex"),
    encrypted.toString("hex"),
  ].join(".");
}
export function unseal(value: string) {
  const [iv, tag, data] = value.split(".");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "hex"),
  );
  cipher.setAuthTag(Buffer.from(tag, "hex"));
  return JSON.parse(
    Buffer.concat([
      cipher.update(Buffer.from(data, "hex")),
      cipher.final(),
    ]).toString(),
  );
}
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, encoded: string) {
  try {
    const [salt, expected] = encoded.split(":");
    const b = Buffer.from(expected, "hex");
    return (
      b.length === 64 && timingSafeEqual(b, scryptSync(password, salt, 64))
    );
  } catch {
    return false;
  }
}
export function redact(value: unknown): any {
  const secrets = [
    config.liaraToken,
    config.aiKey,
    config.githubToken,
    config.demoToken,
  ].filter(Boolean);
  if (typeof value === "string") {
    let s = value;
    for (const secret of secrets) s = s.split(secret).join("[REDACTED]");
    return s
      .replace(/(Bearer\s+)[\w.\-]+/gi, "$1[REDACTED]")
      .replace(
        /((?:password|secret|api[_-]?key|token|authorization)\s*[=:]\s*)[^\s,;]+/gi,
        "$1[REDACTED]",
      )
      .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, "$1[REDACTED]@");
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        /^(envs|variables|authorization|accessKey|secretKey|password|token|apiKey|phone|email|nationalCode)$/i.test(
          k,
        )
          ? "[REDACTED]"
          : redact(v),
      ]),
    );
  return value;
}
export function canonical(value: any): string {
  if (Array.isArray(value))
    return (
      "[" +
      value.map((v) => canonical(v === undefined ? null : v)).join(",") +
      "]"
    );
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .filter((k) => value[k] !== undefined)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(value[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value) ?? "null";
}
