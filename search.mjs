const NORM = (s) => (s || '').toUpperCase().replace(/Ё/g, 'Е').replace(/\s+/g, ' ').trim();
const WS = /[^А-ЯA-Z0-9]+/;
const WORDS = (s) => NORM(s).split(WS).filter(Boolean);

const YEAR = '(?:18|19|20)\\d{2}';
const DATE = '\\b\\d{2}\\.\\d{2}\\.\\d{4}\\b';
const MONTH_YEAR = '\\b\\d{1,2}\\.\\d{4}\\b';

const DROP = new Set([
  'ГОРОД', 'ОБЛ', 'ОБЛАСТЬ', 'КРАЙ', 'РЕСПУБЛИКА', 'РЕСПУБЛИКИ', 'РЕСП',
  'РАЙОН', 'Р-Н', 'ДЕРЕВНЯ', 'ПОСЁЛОК', 'СЕЛО', 'АВТОНОМНЫЙ', 'АВТОНОМНОЙ',
  'ГОРОДА', 'И', 'В', 'НЕ', 'ДО', 'С', 'ПО', 'НА', 'ОТ',
]);
const MARKED_YES = new Set(['МАРКИРОВАН', 'МАРКИРОВАННЫЙ', 'МАРКИРОВАННЫЕ', 'МАРКИРОВАННЫХ', 'МАРКЕД', 'ЕСТЬ', 'ДА', 'ВКЛЮЧЁН', 'ВКЛЮЧЕН']);
const MARKED_NO = new Set(['НЕМАРКИРОВАН', 'НЕМАРКИРОВАННЫЙ', 'НЕМАРКИРОВАННЫЕ', 'НЕМАРКЕД', 'НЕТ', 'ИСКЛЮЧЁН', 'ИСКЛЮЧЕН']);
const KIND_ORG = new Set(['ОРГАНИЗАЦИЯ', 'ОРГАНИЗАЦИИ', 'ОРГАНИЗАЦИЙ', 'ОРГАНИЗАЦИЮ', 'ОРГ', 'ФИРМА', 'КОМПАНИЯ', 'КОМПАНИИ', 'КОМПАНИЙ', 'ЮРЛИЦО']);
const KIND_PERSON = new Set(['ФИЗЛИЦО', 'ФИЗИЧЕСКОЕ', 'ФИЗИЧЕСКИЕ', 'ФИЗИЧЕСКОГО', 'ЧЕЛОВЕК', 'ЧЕЛОВЕКА', 'ЛЮДИ', 'ЛИЦО', 'ЛИЦА']);

export function parseQuest(raw) {
  let q = NORM(raw);
  const res = { kind: null, marked: null, dates: [], monthYears: [], years: [], inns: [], ogrns: [], words: [], raw: NORM(raw) };
  if (!q) return res;

  for (const m of q.matchAll(new RegExp(DATE, 'g'))) res.dates.push(m[0]);
  q = q.replace(new RegExp(DATE, 'g'), ' ');

  for (const m of q.matchAll(new RegExp(MONTH_YEAR, 'g'))) {
    const [mm, yyyy] = m[0].split('.');
    res.monthYears.push({ m: Number(mm), y: Number(yyyy) });
  }
  q = q.replace(new RegExp(MONTH_YEAR, 'g'), ' ');

  for (const m of q.matchAll(new RegExp('\\b(' + YEAR + ')\\b', 'g'))) res.years.push(Number(m[1]));
  q = q.replace(new RegExp('\\b(' + YEAR + ')\\b', 'g'), ' ');

  for (const t of q.split(WS)) {
    if (!t) continue;
    if (/^\d{13}$/.test(t)) res.ogrns.push(t);
    else if (/^\d{10}$|^\d{12}$/.test(t)) res.inns.push(t);
    else if (/^\d+$/.test(t)) continue;
    else if (MARKED_YES.has(t)) res.marked = true;
    else if (MARKED_NO.has(t)) res.marked = false;
    else if (KIND_ORG.has(t)) res.kind = 'org';
    else if (KIND_PERSON.has(t)) res.kind = 'person';
    else res.words.push(t);
  }
  res.words = res.words.filter((w) => w.length > 1 && !DROP.has(w));
  return res;
}

function mMatches(recDob, ms) {
  if (!recDob) return false;
  const m = recDob.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m && Number(m[2]) === ms.m && Number(m[3]) === ms.y;
}

const EMPTY_NUM = (arr) => !arr.length;

function matchPerson(rec, p) {
  if (p.kind === 'org') return false;
  if (p.marked !== null && rec.marked !== p.marked) return false;
  if (p.dates.length && rec.date_of_birth !== p.dates[0]) return false;
  if (p.years.length && !p.years.some((y) => rec.year_of_birth === y)) return false;
  if (p.monthYears.length && !p.monthYears.some((ms) => mMatches(rec.date_of_birth, ms))) return false;
  if (!EMPTY_NUM(p.inns) || !EMPTY_NUM(p.ogrns)) return false;
  if (p.words.length && !p.words.every((w) => wordHit(w, [rec.last_name, rec.first_name, rec.middle_name, ...(rec.aliases || []), rec.place_of_birth].filter(Boolean)))) return false;
  return true;
}

function matchOrg(rec, p) {
  if (p.kind === 'person') return false;
  if (p.marked !== null && rec.marked !== p.marked) return false;
  if (p.dates.length && !(rec.date && p.dates.some((d) => rec.date === d || rec.date.includes(d)))) return false;
  if (p.years.length && !(rec.date && p.years.some((y) => rec.date.includes(String(y))))) return false;
  if (p.monthYears.length && !(rec.date && p.monthYears.some((ms) => mMatches(rec.date, ms)))) return false;
  if (p.inns.length && p.inns.some((i) => rec.inn !== i)) return false;
  if (p.ogrns.length && p.ogrns.some((g) => rec.ogrn !== g)) return false;
  if (p.words.length && !p.words.every((w) => wordHit(w, [rec.name, ...(rec.aliases || []), rec.country].filter(Boolean)))) return false;
  return true;
}

export function matchRecord(rec, p) {
  return rec.type === 'org' ? matchOrg(rec, p) : matchPerson(rec, p);
}

function wordHit(w, hay) {
  for (const field of hay) {
    const fw = WORDS(field);
    if (fw.includes(w)) return true;
    if (w.length >= 4 && NORM(field).includes(w)) return true;
  }
  return false;
}

export function scoreRecord(rec, p) {
  let s = 0;
  if (rec.type === 'org') {
    const hay = { name: WORDS(rec.name), alias: rec.aliases || [], country: WORDS(rec.country || '') };
    for (const w of p.words) {
      if (hay.name.includes(w)) s += 3; else if (w.length >= 4 && NORM(rec.name).includes(w)) s += 2;
      if (hay.alias.includes(w)) s += 1; else if (hay.alias.some((a) => w.length >= 4 && NORM(a).includes(w))) s += 0.8;
      if (hay.country.includes(w)) s += 0.7; else if (w.length >= 4 && NORM(rec.country).includes(w)) s += 0.4;
    }
  } else {
    const hay = { last: WORDS(rec.last_name), first: WORDS(rec.first_name), mid: WORDS(rec.middle_name), alias: rec.aliases || [], place: WORDS(rec.place_of_birth || '') };
    for (const w of p.words) {
      if (hay.last.includes(w)) s += 3; else if (w.length >= 4 && NORM(rec.last_name).includes(w)) s += 2;
      if (hay.first.includes(w)) s += 2; else if (w.length >= 4 && NORM(rec.first_name).includes(w)) s += 1;
      if (hay.mid.includes(w)) s += 1.5; else if (w.length >= 4 && NORM(rec.middle_name).includes(w)) s += 0.8;
      if (hay.alias.includes(w)) s += 1; else if (hay.alias.some((a) => w.length >= 4 && NORM(a).includes(w))) s += 0.8;
      if (hay.place.includes(w)) s += 0.7; else if (w.length >= 4 && NORM(rec.place_of_birth).includes(w)) s += 0.4;
    }
  }
  if (p.years.length) s += 2;
  if (p.dates.length) s += 2;
  if (p.monthYears.length) s += 2;
  if (p.inns.length) s += 2;
  if (p.ogrns.length) s += 2;
  return s;
}

export function search(records, quest, top = 200) {
  const p = typeof quest === 'string' ? parseQuest(quest) : quest;
  const hits = records.filter((r) => matchRecord(r, p));
  hits.sort((a, b) => scoreRecord(b, p) - scoreRecord(a, p) || a.id - b.id);
  return top > 0 ? hits.slice(0, top) : hits;
}

export async function loadRecords(base) {
  fs = await import('node:fs');
  try {
    const people = JSON.parse(fs.readFileSync(base + '/api/people/index.json', 'utf8'));
    const orgs = JSON.parse(fs.readFileSync(base + '/api/orgs/index.json', 'utf8'));
    return [...people, ...orgs];
  } catch {
    const url = 'https://x-cicada-ru.github.io/satp-registry/api/';
    const [pr, or] = await Promise.all([fetch(url + 'people/index.json'), fetch(url + 'orgs/index.json')]);
    return [...(await pr.json()), ...(await or.json())];
  }
}

let fs = null;
const { pathToFileURL } = await import('node:url');

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--top');
  const top = i >= 0 ? Number(args[i + 1]) : 200;
  if (i >= 0) args.splice(i, 2);
  const quest = args.join(' ');
  if (!quest) {
    console.error('usage: node search.mjs "<quest>" [--top N]');
    process.exit(2);
  }
  const records = await loadRecords(process.cwd());
  const out = search(records, quest, 0);
  console.log(JSON.stringify({ quest, count: out.length, results: out }, null, 2));
}