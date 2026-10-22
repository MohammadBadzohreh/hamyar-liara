import { readFile, readdir, lstat, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { parse } from 'dotenv';
import { c } from 'tar';

// Explicit allowlist: never include local credentials, databases or test captures.
const roots = ['.gitignore', '.dockerignore', '.env.example', 'Dockerfile', 'liara.json',
  'README.md', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts',
  'index.html', 'src', 'server', 'sample', 'scripts', 'tests', 'docs'];
const files = [];
async function visit(path) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) throw new Error(`Symlink not allowed: ${path}`);
  if (stat.isDirectory()) {
    for (const child of await readdir(path)) {
      if (['.local', '.git', 'node_modules', 'dist'].includes(child)) throw new Error(`Private/generated directory in source: ${path}`);
      await visit(join(path, child));
    }
  } else {
    if (/(^|[\\/])\.env(?!\.example$)|\.sqlite|owner-login|\.pem$|\.key$/i.test(path))
      throw new Error(`Private file in source: ${path}`);
    files.push(path);
  }
}
for (const root of roots) await visit(root);
let env = {};
try { env = parse(await readFile('.env')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const secrets = Object.entries(env).filter(([key, value]) => /TOKEN|KEY|PASSWORD|SECRET/.test(key) && value.length >= 12);
const manifest = [];
for (const path of files.sort()) {
  const content = await readFile(path), text = content.toString('utf8');
  for (const [key, secret] of secrets) if (text.includes(secret)) throw new Error(`Configured secret ${key} found in ${path}`);
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) throw new Error(`Private key found in ${path}`);
  manifest.push({ path: path.replaceAll('\\', '/'), size: content.length, sha256: createHash('sha256').update(content).digest('hex') });
}
await mkdir('.local/delivery', { recursive: true });
const output = '.local/delivery/hamyar-liara-source.tar.gz';
await c({ file: output, gzip: true, portable: true, noMtime: true }, files);
const checksum = createHash('sha256').update(await readFile(output)).digest('hex');
await writeFile('.local/delivery/manifest.json', JSON.stringify({ at: new Date().toISOString(), output, sha256: checksum, files: manifest,
  secretCheck: 'Configured credential values and private-key headers only; not a comprehensive secret scanner.' }, null, 2));
console.log(JSON.stringify({ output, files: files.length, sha256: checksum, configuredSecretsAbsent: true }));
