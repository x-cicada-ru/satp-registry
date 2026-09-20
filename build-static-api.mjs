import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VAULT = 'C:/Users/web.root$/Documents/Obsidian Vault/SATP - (Scope Anti-Terroroism Project)';
const OUT = path.join(__dirname, 'api');

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

function personSummary(r) {
  return {
    id: r.id,
    type: 'person',
    name: r.name,
    aliases: r.al,
    last_name: r.last,
    first_name: r.first,
    middle_name: r.middle,
    date_of_birth: r.dob,
    year_of_birth: r.yob,
    place_of_birth: r.place,
    letter: r.letter,
    marked: r.marked,
  };
}

function orgSummary(r) {
  return {
    id: r.id,
    type: 'org',
    name: r.name,
    aliases: r.al,
    country: r.country,
    inn: r.inn,
    ogrn: r.ogrn,
    date: r.date,
    marked: r.marked,
  };
}

const VALID_LETTER = /^[А-Я]$/;

async function main() {
  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(path.join(OUT, 'people', 'letter'), { recursive: true });
  await fs.mkdir(path.join(OUT, 'people'), { recursive: true });
  await fs.mkdir(path.join(OUT, 'orgs'), { recursive: true });

  const files = [];
  await walk(VAULT, '', files);

  const people = [];
  const orgs = [];
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
      people.push({
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
        text: f.text,
      });
    } else if (om && Number.isInteger(id)) {
      orgs.push({
        id,
        k: 'o',
        name: typeof props.name === 'string' ? props.name : '',
        al: Array.isArray(props.aliases) ? props.aliases : [],
        country: typeof props.country === 'string' && props.country ? props.country : null,
        inn: typeof props.inn === 'string' && props.inn ? props.inn : null,
        ogrn: typeof props.ogrn === 'string' && props.ogrn ? props.ogrn : null,
        date: typeof props.date === 'string' && props.date ? props.date : null,
        marked: props.marked === true,
        text: f.text,
      });
    }
  }

  people.sort((a, b) => a.id - b.id);
  orgs.sort((a, b) => a.id - b.id);

  const built = new Date().toISOString();
  const base = 'https://x-cicada-ru.github.io/satp-registry/api';

  const stats = {
    total: people.length + orgs.length,
    people: people.length,
    orgs: orgs.length,
    marked: {
      people: people.filter((r) => r.marked).length,
      orgs: orgs.filter((r) => r.marked).length,
    },
    letters,
    org_countries: {
      total: new Set(orgs.map((r) => r.country).filter(Boolean)).size,
    },
    orgs_with: {
      inn: orgs.filter((r) => r.inn).length,
      ogrn: orgs.filter((r) => r.ogrn).length,
    },
    version: '1.0.0',
    built,
  };

  const manifest = {
    name: 'SATP Registry static API (GitHub Pages)',
    description: 'Ключевой статический API по перечню организаций и физических лиц. Без авторизации.',
    version: '1.0.0',
    built,
    base: base + '/',
    counts: { total: stats.total, people: stats.people, orgs: stats.orgs },
    endpoints: {
      'GET /api/health.json': 'Проверка доступности',
      'GET /api/manifest.json': 'Описание API',
      'GET /api/stats.json': 'Статистика реестра',
      'GET /api/people/index.json': 'Все физические лица (сводки)',
      'GET /api/people/letter/А.json … /api/people/letter/Я.json': 'Сводки по букве раздела',
      'GET /api/people/{id}.json': 'Карточка физлица с полным текстом',
      'GET /api/orgs/index.json': 'Все организации (сводки)',
      'GET /api/orgs/{id}.json': 'Карточка организации с полным текстом',
    },
  };

  // service
  await fs.writeFile(path.join(OUT, 'health.json'), JSON.stringify({ ok: true, records: stats.total, version: '1.0.0', built }, null, 2), 'utf8');
  await fs.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  await fs.writeFile(path.join(OUT, 'stats.json'), JSON.stringify(stats, null, 2), 'utf8');

  // people index
  await fs.writeFile(path.join(OUT, 'people', 'index.json'), JSON.stringify(people.map(personSummary), null, 2), 'utf8');

  // people by letter
  let letterFiles = 0;
  for (const [letter, values] of Object.entries(letters)) {
    if (!VALID_LETTER.test(letter)) continue;
    const list = people.filter((r) => r.letter === letter).map(personSummary);
    await fs.writeFile(path.join(OUT, 'people', 'letter', letter + '.json'), JSON.stringify(list, null, 2), 'utf8');
    letterFiles++;
  }
  await fs.writeFile(path.join(OUT, 'people', 'letter', 'index.json'), JSON.stringify({ letters: Object.keys(letters).sort() }, null, 2), 'utf8');

  // people details
  for (const r of people) {
    const card = { record: personSummary(r), body: r.text };
    await fs.writeFile(path.join(OUT, 'people', r.id + '.json'), JSON.stringify(card, null, 2), 'utf8');
  }

  // orgs index + details
  await fs.writeFile(path.join(OUT, 'orgs', 'index.json'), JSON.stringify(orgs.map(orgSummary), null, 2), 'utf8');
  for (const r of orgs) {
    const card = { record: orgSummary(r), body: r.text };
    await fs.writeFile(path.join(OUT, 'orgs', r.id + '.json'), JSON.stringify(card, null, 2), 'utf8');
  }

  console.log('people:', people.length, 'orgs:', orgs.length, 'total:', stats.total);
  console.log('letters:', JSON.stringify(letters), 'letter files:', letterFiles);
  console.log('detail files: people', people.length, 'orgs', orgs.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});