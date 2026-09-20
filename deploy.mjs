import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, 'dist');

const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const NS_TITLE = 'satp-registry-index';

if (!token) {
  console.error('Missing CLOUDFLARE_API_TOKEN secret');
  process.exit(1);
}
if (!account) {
  console.error('Missing CLOUDFLARE_ACCOUNT_ID secret');
  process.exit(1);
}

const api = 'https://api.cloudflare.com/client/v4';
const headers = {
  Authorization: 'Bearer ' + token,
  'Content-Type': 'application/json',
};

async function cf(pathname, method = 'GET', body) {
  const res = await fetch(api + pathname, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json();
  if (!res.ok || j.success === false) {
    throw new Error(method + ' ' + pathname + ' -> ' + res.status + ' ' + JSON.stringify(j.errors || j));
  }
  return j.result;
}

async function ensureNamespace() {
  const list = await cf('/accounts/' + account + '/storage/kv/namespaces?per_page=100');
  const existing = Array.isArray(list) ? list.find((n) => n.title === NS_TITLE) : null;
  if (existing) {
    console.log('namespace exists:', existing.id);
    return existing.id;
  }
  const created = await cf('/accounts/' + account + '/storage/kv/namespaces', 'POST', { title: NS_TITLE });
  console.log('namespace created:', created.id);
  return created.id;
}

async function bulkPut(nsId) {
  const entries = JSON.parse(await fs.readFile(path.join(DIST, 'kv-bulk.json'), 'utf8'));
  if (!Array.isArray(entries) || entries.length < 100) {
    console.error('kv-bulk.json missing or too small');
    process.exit(1);
  }
  console.log('kv entries:', entries.length);
  const CHUNK = 4000;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    const res = await cf('/accounts/' + account + '/storage/kv/namespaces/' + nsId + '/bulk', 'PUT', chunk);
    console.log('bulk chunk ok:', i + 1 + '..' + (i + chunk.length), 'missing_keys:', res && res.noConflicts ? res : 0);
  }
}

async function main() {
  const nsId = await ensureNamespace();
  await bulkPut(nsId);

  const tpl = await fs.readFile(path.join(__dirname, 'wrangler.toml.template'), 'utf8');
  await fs.writeFile(
    path.join(__dirname, 'wrangler.toml'),
    tpl.replace('__NS_ID__', nsId),
    'utf8'
  );

  console.log('deploying worker via wrangler...');
  execSync('npx --yes wrangler deploy', { cwd: __dirname, stdio: 'inherit', env: process.env });
  console.log('deploy done');
}

main().catch((err) => { console.error(err); process.exit(1); });