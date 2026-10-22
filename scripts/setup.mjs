import { existsSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { randomBytes, scryptSync } from "node:crypto";
if (existsSync(".env")) {
  console.log(".env already exists; left unchanged.");
  process.exit(0);
}
const password = randomBytes(12).toString("base64url"),
  salt = randomBytes(16).toString("hex");
mkdirSync(".local", { recursive: true });
const template = readFileSync(".env.example", "utf8")
  .replace(
    /^OWNER_PASSWORD_HASH=.*$/m,
    `OWNER_PASSWORD_HASH=${salt}:${scryptSync(password, salt, 64).toString("hex")}`,
  )
  .replace(
    /^ENCRYPTION_KEY=.*$/m,
    `ENCRYPTION_KEY=${randomBytes(32).toString("hex")}`,
  )
  .replace(/^DEMO_TOKEN=.*$/m, `DEMO_TOKEN=${randomBytes(32).toString("hex")}`);
writeFileSync(".env", template, { mode: 0o600 });
writeFileSync(".local/owner-login.txt", `Local owner password: ${password}\n`, {
  mode: 0o600,
});
console.log(
  "Created .env and .local/owner-login.txt. Credentials were not printed. Fill external credentials in .env; never commit it.",
);
