import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VAULT = 'C:/Users/web.root$/Documents/Obsidian Vault/SATP - (Scope Anti-Terroroism Project)';
const DIST = path.join(__dirname, 'dist');

const PERSON_RE = /^Физ лица\/Заметки\/([А-Я])\/(\d{5}) (.+)\.md$/;
const ORG_RE = /^Организации\/Заметки\/(\d{4}) (.+)\.md$/;

function toNumDate(dob) {
  if (!dob || typeof dob !== 'string') return null;
  const m = dob.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? Number(m[3] + m[2] + m[1]) : null;
}

function parseProps(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const props = {};
  if (!m) return props;
  for (const raw of m[1].split(/\r?\n/)) {
    const i = raw.indexOf(':');
    if (i <= 0) continue;
    const key = raw.slice(0, i).trim();
    if (!key) continue;
    let val = raw.slice(i + 1).trim();
    try {
      props[key] = JSON.parse(val);
    } catch {
      props[key] = val.replace(/^["']|["']$/g, '');
    }
  }
  return props;
}

async function walk(dir, base, out) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.posix.join(base, e.name);
    if (e.isDirectory()) {
      await walk(full, rel, out);
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
      const text = await fs.readFile(full, 'utf8');
      out.push({ rel, text });
    }
  }
}

function splitName(name) {
  const parts = (name || '').split(/\s+/).filter(Boolean);
  return {
    last: parts[0] || '',
    first: parts[1] || '',
    middle: parts.slice(2).join(' '),
  };
}

async function main() {
  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST, { recursive: true });

  const files = [];
  await walk(VAULT, '', files);

  const index = [];
  const bodies = [];
  let people = 0;
  let orgs = 0;
  const letters = {};

  for (const f of files) {
    const pm = f.rel.match(PERSON_RE);
    const om = ORG_RE.test(f.rel) ? f.rel.match(ORG_RE) : null;
    if (!pm && !om) continue;

    const props = parseProps(f.text);
    const id = Number(props.id);

    if (pm && Number.isInteger(id)) {
      const dob = typeof props.dateOfBirth === 'string' ? props.dateOfBirth : null;
      const name = typeof props.fullName === 'string' ? props.fullName : '';
      const { last, first, middle } = splitName(name);
      const letter = pm[1];
      letters[letter] = (letters[letter] || 0) + 1;
      index.push({
        id,
        k: 'p',
        name,
        last,
        first,
        middle,
        al: Array.isArray(props.aliases) ? props.aliases : [],
        dob,
        yob: dob ? Number(dob.slice(6, 10)) : null,
        place: typeof props.placeOfBirth === 'string' && props.placeOfBirth ? props.placeOfBirth : null,
        marked: props.marked === true,
        letter,
      });
      bodies.push({ key: 'b:p' + id, value: f.text });
      people++;
    } else if (om && Number.isInteger(id)) {
      index.push({
        id,
        k: 'o',
        name: typeof props.name === 'string' ? props.name : '',
        al: Array.isArray(props.aliases) ? props.aliases : [],
        country: typeof props.country === 'string' && props.country ? props.country : null,
        inn: typeof props.inn === 'string' && props.inn ? props.inn : null,
        ogrn: typeof props.ogrn === 'string' && props.ogrn ? props.ogrn : null,
        date: typeof props.date === 'string' && props.date ? props.date : null,
        marked: props.marked === true,
      });
      bodies.push({ key: 'b:o' + id, value: f.text });
      orgs++;
    }
  }

  index.sort((a, b) => a.id - b.id);

  const meta = {
    version: '1.0.0',
    built: new Date().toISOString(),
    total: index.length,
    people,
    orgs,
    letters,
  };

  bodies.push({ key: 'idx', value: JSON.stringify(index) });
  bodies.push({ key: 'meta', value: JSON.stringify(meta) });

  await fs.writeFile(path.join(DIST, 'index.json'), JSON.stringify(index), 'utf8');
  await fs.writeFile(path.join(DIST, 'kv-bulk.json'), JSON.stringify(bodies), 'utf8');
  await fs.writeFile(path.join(DIST, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');

  console.log('people:', people, 'orgs:', orgs, 'total:', index.length, 'kv entries:', bodies.length);
  console.log('letters:', JSON.stringify(letters));
}

main().catch((err) => { console.error(err); process.exit(1); });