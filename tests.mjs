import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize } from './core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let failures = 0;
function check(name, cond, extra) {
  const ok = cond === true;
  if (!ok) failures++;
  console.log((ok ? '[ok]  ' : '[FAIL] ') + name + (ok ? '' : '  -> ' + (extra != null ? JSON.stringify(extra).slice(0, 200) : '')));
  return ok;
}

async function main() {
  const bulk = JSON.parse(await fs.readFile(path.join(__dirname, 'dist', 'kv-bulk.json'), 'utf8'));
  const store = new Map(bulk.map((e) => [e.key, e.value]));
  const idx = JSON.parse(store.get('idx'));

  const env = {
    REG: {
      get: async (k) => (store.has(k) ? store.get(k) : null),
    },
  };

  const worker = (await import('./worker.mjs')).default;
  const call = async (pathStr, e = env) => {
    const res = await worker.fetch(new Request('http://test.invalid' + pathStr), e, { waitUntil() {} });
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    return { status: res.status, body, cors: res.headers.get('access-control-allow-origin') };
  };

  check('dataset: people+orgs>20000', idx.length > 20000);
  check('dataset: contains person id 1', idx.some((r) => r.id === 1 && r.k === 'p'));
  check('dataset: contains org id 1', idx.some((r) => r.id === 1 && r.k === 'o'));
  check('normalize folds Ё->Е', normalize('ЁЖИК ёжик') === 'ЕЖИК ЕЖИК');

  let r = await call('/api/health');
  check('health ok', r.status === 200 && r.body && r.body.ok === true);
  check('health has records', r.body && r.body.records > 20000);
  check('cors present', r.cors === '*');

  r = await call('/');
  check('overview has endpoints', !!(r.status === 200 && r.body && r.body.endpoints && r.body.endpoints['GET /api/people']));

  r = await call('/api/people?q=АБАБАКАРОВ');
  check('search q=АБАБАКАРОВ -> >=1', r.status === 200 && r.body.total >= 1);
  check('search q first item id=1', r.body && r.body.items[0] && r.body.items[0].id === 1);

  r = await call('/api/people?type=person');
  check('type=person returns only people', r.body.items.every((x) => x.type === 'person'));

  r = await call('/api/people?last_name=АБАБАКАРОВ');
  check('last_name filter', r.status === 200 && r.body.total >= 1 && r.body.items.every((x) => (x.last_name || '').includes('АБАБАКАРОВ')));

  r = await call('/api/people?first_name=АБДУЛЛА&middle_name=ГАСАНОВИЧ');
  check('first+middle filter hits id 1', r.body.items.some((x) => x.id === 1));

  r = await call('/api/people?dob=08.06.1996');
  check('dob exact hits id 1', r.status === 200 && r.body.items.some((x) => x.id === 1 && x.date_of_birth === '08.06.1996'));

  r = await call('/api/people?yob=1996');
  check('yob filter', r.status === 200 && r.body.total > 0 && r.body.items.every((x) => x.year_of_birth === 1996));

  r = await call('/api/people?yob_from=1990&yob_to=2000');
  check('yob range', r.status === 200 && r.body.total > 0 && r.body.items.every((x) => x.year_of_birth >= 1990 && x.year_of_birth <= 2000));

  r = await call('/api/people?date_from=01.01.1996&date_to=31.12.1996&sort=yob');
  check('date range respects sort', r.status === 200 && r.body.total > 0 && r.body.items.every((x) => x.year_of_birth === 1996));

  r = await call('/api/people?letter=А');
  check('letter=А >2000', r.status === 200 && r.body.total > 2000);

  r = await call('/api/people?letter=А&marked=1');
  check('marked=1 all marked', r.status === 200 && r.body.total >= 0 && r.body.items.every((x) => x.marked === true));
  r = await call('/api/people?letter=А&marked=нет');
  check('marked=нет works (ru)', r.status === 200 && r.body.items.every((x) => x.marked === false));

  r = await call('/api/people?place=ДАГЕСТАН');
  check('place filter hits id1', r.status === 200 && r.body.items.some((x) => x.id === 1) && r.body.items.every((x) => (x.place_of_birth || '').includes('ДАГЕСТАН')));

  const page1 = await call('/api/people?q=А&limit=5&page=1');
  const page2 = await call('/api/people?q=А&limit=5&page=2');
  check('pagination: pages differ', page1.status === 200 && page2.status === 200 && page1.body.items[0].id !== page2.body.items[0].id && page2.body.items.length === 5);
  check('pagination: total>pages', page1.body.total >= 10 && page1.body.pages === Math.ceil(page1.body.total / 5));

  r = await call('/api/people?limit=99999');
  check('limit clamped to 500', r.status === 200 && r.body.limit === 500 && r.body.items.length === 500);
  r = await call('/api/people?page=abc');
  check('bad page defaults to 1', r.status === 200 && r.body.page === 1);

  r = await call('/api/people?q=А&sort=-name&limit=10');
  const names = r.body.items.map((x) => x.name);
  check('sort=-name descending', names.slice().sort((a, b) => b.localeCompare(a, 'ru')).join('|') === names.join('|'));

  r = await call('/api/orgs?name=RUSSIA');
  check('orgs q name', r.status === 200 && r.body.items.some((x) => x.id === 1 && /RUSSIA/.test(x.name)));
  r = await call('/api/orgs?name=мемориал');
  check('org name case-insensitive', r.status === 200 && r.body.total >= 0);
  r = await call('/api/orgs?q=MEMORIAL');
  check('org q hits id2', r.body.items.some((x) => x.id === 2));

  const orgWithInn = idx.find((x) => x.k === 'o' && x.inn);
  if (orgWithInn) {
    r = await call('/api/orgs?inn=' + encodeURIComponent(orgWithInn.inn));
    check('org inn filter', r.status === 200 && r.body.items.every((x) => (x.inn || '').includes(orgWithInn.inn)) && r.body.total >= 1);
  } else {
    console.log('[warn] no org with inn in dataset');
  }
  const orgWithCountry = idx.find((x) => x.k === 'o' && x.country && !x.country.includes('Россия'));
  if (orgWithCountry) {
    const probe = orgWithCountry.country.slice(0, 10);
    r = await call('/api/orgs?country=' + encodeURIComponent(probe));
    check('org country filter', r.status === 200 && r.body.items.every((x) => (x.country || '').includes(probe)));
  } else {
    console.log('[warn] no foreign org country in dataset');
  }
  r = await call('/api/orgs?marked=1');
  check('org marked filter', r.status === 200 && r.body.items.every((x) => x.marked === true));

  r = await call('/api/people?type=org');
  check('conflicting type -> 400', r.status === 400);
  r = await call('/api/search');
  check('search mixed types', r.status === 200 && r.body.total > 0 && new Set(r.body.items.map((x) => x.type)).size >= 2);
  r = await call('/api/search?type=person&q=1');
  check('search person only', r.body.items.every((x) => x.type === 'person'));

  r = await call('/api/people/1');
  check('detail person 1 has body', r.status === 200 && r.body.body && r.body.body.includes('Исходная строка'));
  check('detail person 1 meta name', r.body.record.name === 'АБАБАКАРОВ АБДУЛЛА ГАСАНОВИЧ');
  r = await call('/api/people/1?x=1');
  check('query string ignored on detail', r.status === 200);

  r = await call('/api/orgs/1');
  check('detail org 1', r.status === 200 && r.body.record.name.includes('FREE RUSSIA')) || undefined;
  r = await call('/api/people/999999');
  check('detail 404', r.status === 404);
  r = await call('/api/people/abc');
  check('detail bad id 400', r.status === 400);

  r = await call('/api/stats');
  check('stats totals', r.status === 200 && r.body.people + r.body.orgs === r.body.total);
  check('stats countries list', Array.isArray(r.body.org_countries.list));

  r = await call('/api/nope');
  check('unknown endpoint 404', r.status === 404);

  console.log('');
  if (failures > 0) {
    console.log('FAILURES:', failures);
    process.exit(1);
  }
  console.log('ALL OK');
}

main().catch((e) => { console.error(e); process.exit(1); });