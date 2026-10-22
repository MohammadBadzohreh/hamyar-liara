import { cp, mkdir, readFile, writeFile, access } from "node:fs/promises";
import { resolve, join } from "node:path";
const mode = process.argv[2] || "healthy";
if (!["healthy", "buggy"].includes(mode))
  throw new Error("Choose healthy or buggy");
const target = resolve(".local", `sample-${mode}`);
try {
  await access(target);
  throw new Error("Target exists; no files overwritten.");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
await mkdir(target, { recursive: true });
await cp(resolve("sample"), target, { recursive: true });
if (mode === "buggy")
  await writeFile(
    join(target, "src/checkout.mjs"),
    await readFile("sample/fixtures/checkout-buggy.txt"),
  );
console.log(
  `Prepared ${mode} sample at ${target}. No remote action performed.`,
);
