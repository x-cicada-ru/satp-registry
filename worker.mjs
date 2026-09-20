import { buildFilter, parseSearchParams, sortRecords, paginate } from './core.mjs';

const HEAD = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

let memo = null;
let memoAt = 0;

async function data(env) {
  if (memo && Date.now() - memoAt < 60000) return memo;
  const idxRaw = await env.REG.get('idx');
  if (!idxRaw) throw new Error('data index not found');
  const metaRaw = await env.REG.get('meta');
  const idx = JSON.parse(idxRaw);
  const meta = metaRaw ? JSON.parse(metaRaw) : null;
  memo = { idx, meta };
  memoAt = Date.now();
  return memo;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: HEAD });
}

function error(msg, status = 400, extra = {}) {
  return json({ error: msg, ...extra }, status);
}

const sortFields = ['id', 'name', 'dob', 'yob', 'date'];

function summarize(r) {
  return {
    id: r.id,
    type: r.k === 'p' ? 'person' : 'org',
    name: r.name,
    aliases: r.al,
    ...(r.k === 'p'
      ? {
          last_name: r.last,
          first_name: r.first,
          middle_name: r.middle,
          date_of_birth: r.dob,
          year_of_birth: r.yob,
          place_of_birth: r.place,
          letter: r.letter,
        }
      : {
          country: r.country,
          inn: r.inn,
          ogrn: r.ogrn,
          date: r.date,
        }),
    marked: r.marked,
  };
}

function buildQuery(p) {
  const q = { ...p, dob: p.dob || undefined, type: p.type ? (p.type === 'p' ? 'person' : 'org') : undefined };
  for (const k of ['dob', 'yob', 'yob_from', 'yob_to', 'date_from', 'date_to', 'page', 'limit', 'offset']) {
    if (q[k] == null) delete q[k];
  }
  for (const k of ['q', 'name', 'last_name', 'first_name', 'middle_name', 'place', 'letter', 'alias', 'country', 'inn', 'ogrn', 'sort']) {
    if (!q[k] || (k === 'sort' && q[k] === 'id')) delete q[k];
  }
  if (q.marked == null) delete q.marked;
  if (q.type == null) delete q.type;
  if (q.letter) q.letter = q.letter.toUpperCase();
  return q;
}

function runQuery(idx, p, type) {
  const filter = buildFilter(p);
  const all = (r) => (type ? r.k === type : true);
  const out = [];
  for (const r of idx) {
    if (all(r) && filter(r)) out.push(r);
  }
  return sortRecords(out, p);
}

async function overview(env) {
  const { idx, meta } = await data(env);
  return json({
    name: 'SATP Registry API',
    description: 'Публичный ключевой API по перечню организаций и физических лиц.',
    version: meta && meta.version,
    built: meta && meta.built,
    records: meta ? meta.total : idx.length,
    base_url: '/api',
    endpoints: {
      'GET /api/health': 'Простая проверка доступности',
      'GET /api/stats': 'Статистика реестра',
      'GET /api/search': 'Поиск по всем записям (type=person|org)',
      'GET /api/people': 'Поиск по физическим лицам',
      'GET /api/people/:id': 'Карточка физического лица с полным текстом',
      'GET /api/orgs': 'Поиск по организациям',
      'GET /api/orgs/:id': 'Карточка организации с полным текстом',
    },
    params: {
      q: 'подстрока по имени, псевдонимам, месту рождения (люди) или стране (организации), регистронезависимо',
      name: 'подстрока в полном имени/названии',
      last_name: 'подстрока в фамилии',
      first_name: 'подстрока в имени',
      middle_name: 'подстрока в отчестве',
      dob: 'дата рождения точно, формат DD.MM.YYYY',
      yob: 'год рождения точно, например 1996',
      yob_from: 'год рождения, от (включительно)',
      yob_to: 'год рождения, до (включительно)',
      date_from: 'дата рождения от (DD.MM.YYYY или YYYY-MM-DD)',
      date_to: 'дата рождения до (DD.MM.YYYY или YYYY-MM-DD)',
      place: 'подстрока в месте рождения',
      letter: 'буква раздела (А..Я)',
      alias: 'подстрока в псевдонимах',
      country: 'подстрока в стране (организации)',
      inn: 'подстрока в ИНН',
      ogrn: 'подстрока в ОГРН',
      date: 'исключено из фильтров организаций',
      marked: '"1"/"true"/"да" или "0"/"false"/"нет"',
      type: 'person | org (только для /api/search)',
      page: 'номер страницы, по умолчанию 1',
      limit: 'записей на странице, 1..500, по умолчанию 10',
      offset: 'смещение вместо page',
      sort: 'id | name | dob | yob | date, префикс "-" для обратного порядка',
    },
    examples: {
      'по фамилии': '/api/people?last_name=АБАБАКАРОВ',
      'по имени и году': '/api/people?first_name=АБДУЛЛА&yob=1996',
      'по месту рождения': '/api/people?place=ДАГЕСТАН&marked=1',
      'по организации': '/api/orgs?name=MEMORIAL',
      'по ИНН': '/api/orgs?inn=7701008',
      'карточка': '/api/people/1',
    },
  });
}

async function stats(env) {
  const { idx, meta } = await data(env);
  let markedPeople = 0;
  let markedOrgs = 0;
  const countries = new Set();
  let withInn = 0;
  let withOgrn = 0;
  let people = 0;
  let orgs = 0;
  for (const r of idx) {
    if (r.k === 'p') {
      people++;
      if (r.marked) markedPeople++;
    } else {
      orgs++;
      if (r.marked) markedOrgs++;
      if (r.country) countries.add(r.country);
      if (r.inn) withInn++;
      if (r.ogrn) withOgrn++;
    }
  }
  return json({
    total: idx.length,
    people,
    orgs,
    marked: { people: markedPeople, orgs: markedOrgs },
    letters: meta ? meta.letters : null,
    org_countries: { total: countries.size, list: [...countries].sort((a, b) => a.localeCompare(b, 'ru')) },
    orgs_with: { inn: withInn, ogrn: withOgrn },
    version: meta && meta.version,
    built: meta && meta.built,
  });
}

async function searchEndpoint(sp, forcedType, env) {
  const p = parseSearchParams(sp);
  if (forcedType && p.type && p.type !== forcedType) return error('conflicting type parameter');
  const type = forcedType || p.type;
  const { idx } = await data(env);
  const records = runQuery(idx, p, type);
  const page = paginate(records, p);
  return json({
    query: buildQuery(p),
    total: page.total,
    page: page.page,
    limit: page.limit,
    offset: page.offset,
    pages: page.pages,
    items: page.items.map(summarize),
  });
}

async function detailEndpoint(parts, env) {
  const typeKey = parts[1] === 'people' || parts[1] === 'person' ? 'p' : 'o';
  const idStr = parts[2];
  if (!/^\d+$/.test(idStr)) return error('id must be a number', 400);
  const id = Number(idStr);
  const { idx } = await data(env);
  const rec = idx.find((r) => r.k === typeKey && r.id === id);
  if (!rec) return error('record not found', 404);
  const body = await env.REG.get('b:' + typeKey + id);
  return json({
    record: summarize(rec),
    body: body == null ? null : body,
  });
}

export default {
  async fetch(request, env) {
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: HEAD });
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return error('method not allowed', 405);
      }
      const u = new URL(request.url);
      const parts = u.pathname.split('/').filter(Boolean);
      const sp = u.searchParams;

      if (parts.length === 0) return await overview(env);
      if (parts.length === 1 && parts[0] === 'api') return await overview(env);
      if (parts[0] !== 'api') return error('not found', 404);

      const head = parts[1];
      if (parts.length === 2) {
        if (head === 'health') {
          const { idx, meta } = await data(env);
          return json({ ok: true, records: idx.length, version: meta && meta.version });
        }
        if (head === 'stats') return await stats(env);
        if (head === 'search') return await searchEndpoint(sp, null, env);
        if (head === 'people' || head === 'person' || head === 'persons' || head === 'fiz') return await searchEndpoint(sp, 'p', env);
        if (head === 'orgs' || head === 'org' || head === 'organizations') return await searchEndpoint(sp, 'o', env);
        return error('unknown endpoint /api/' + head, 404);
      }

      if (parts.length === 3) {
        const typeOk = ['people', 'person', 'persons', 'fiz', 'orgs', 'org', 'organizations'].includes(head);
        if (!typeOk) return error('unknown endpoint', 404);
        return await detailEndpoint(parts, env);
      }

      return error('not found', 404);
    } catch (e) {
      return json({ error: 'internal error', message: String((e && e.message) || e) }, 500);
    }
  },
};