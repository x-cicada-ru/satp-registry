export function normalize(s) {
  return (s == null ? '' : String(s)).toUpperCase().replace(/\u0401/g, '\u0415').replace(/\s+/g, ' ').trim();
}

export function toNumDate(v) {
  if (!v || typeof v !== 'string') return null;
  let s = v.trim();
  let m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return Number(m[3] + m[2] + m[1]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return Number(m[1] + m[2] + m[3]);
  if (/^\d{4}$/.test(s)) return Number(s) * 10000 + 101;
  return null;
}

export function parseSearchParams(sp) {
  const g = (k) => {
    const v = sp.get(k);
    return v == null ? '' : v.trim();
  };
  const num = (k) => {
    const v = g(k);
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const bool = (k) => {
    const v = g(k).toLowerCase();
    if (['1', 'true', 'yes', 'да', 'on'].includes(v)) return true;
    if (['0', 'false', 'no', 'нет', 'off'].includes(v)) return false;
    return null;
  };
  const typeRaw = g('type').toLowerCase();
  let type = null;
  if (['p', 'person', 'people', 'физлицо', 'физлица'].includes(typeRaw)) type = 'p';
  else if (['o', 'org', 'orgs', 'organization', 'organizations', 'организация', 'организации'].includes(typeRaw)) type = 'o';

  const p = {
    q: g('q'),
    name: g('name'),
    last_name: g('last_name'),
    first_name: g('first_name'),
    middle_name: g('middle_name'),
    dob: g('dob'),
    yob: num('yob'),
    yob_from: num('yob_from'),
    yob_to: num('yob_to'),
    date_from: toNumDate(g('date_from')),
    date_to: toNumDate(g('date_to')),
    place: g('place'),
    letter: g('letter').toUpperCase(),
    alias: g('alias'),
    country: g('country'),
    inn: g('inn'),
    ogrn: g('ogrn'),
    marked: bool('marked'),
    type,
    page: num('page'),
    limit: num('limit'),
    offset: num('offset'),
    sort: g('sort') || 'id',
  };

  if (p.page == null || p.page < 1) p.page = 1;
  if (p.limit == null || p.limit < 1) p.limit = 10;
  if (p.limit > 500) p.limit = 500;
  if (p.offset != null && p.offset < 0) p.offset = 0;
  p.page = Math.floor(p.page);
  p.limit = Math.floor(p.limit);

  const sort = p.sort;
  const dir = sort.startsWith('-') ? -1 : 1;
  const name = sort.replace(/^-/, '');
  p.sortValid = ['id', 'name', 'dob', 'yob', 'date'].includes(name);
  p.sortField = p.sortValid ? name : 'id';
  p.sortDir = p.sortValid ? dir : 1;
  return p;
}

export function buildFilter(p) {
  const normQ = p.q ? normalize(p.q) : null;
  const has = (x) => x != null && x !== '';
  const hasN = (x) => x != null && Number.isFinite(x);
  return function matches(r) {
    if (normQ) {
      let hit = false;
      const hay = [r.name, ...(r.al || []), r.place, r.country];
      for (const h of hay) {
        if (h && normalize(h).includes(normQ)) { hit = true; break; }
      }
      if (!hit) return false;
    }
    if (has(p.name) && !normalize(r.name).includes(normalize(p.name))) return false;
    if (has(p.last_name) && !normalize(r.last).includes(normalize(p.last_name))) return false;
    if (has(p.first_name) && !normalize(r.first).includes(normalize(p.first_name))) return false;
    if (has(p.middle_name) && !normalize(r.middle).includes(normalize(p.middle_name))) return false;

    if (has(p.dob) && r.dob !== p.dob) return false;
    if (hasN(p.yob) && r.yob !== p.yob) return false;
    if (hasN(p.yob_from)) { const y = r.yob; if (y == null || y < p.yob_from) return false; }
    if (hasN(p.yob_to)) { const y = r.yob; if (y != null && y > p.yob_to) return false; }

    if (hasN(p.date_from)) {
      const dv = r.dob ? toNumDate(r.dob) : null;
      if (dv == null || dv < p.date_from) return false;
    }
    if (hasN(p.date_to)) {
      const dv = r.dob ? toNumDate(r.dob) : null;
      if (dv != null && dv > p.date_to) return false;
    }

    if (has(p.place) && !normalize(r.place).includes(normalize(p.place))) return false;
    if (has(p.letter) && r.letter !== p.letter) return false;
    if (has(p.alias) && !(r.al || []).some((x) => normalize(x).includes(normalize(p.alias)))) return false;

    if (has(p.country) && !normalize(r.country).includes(normalize(p.country))) return false;
    if (has(p.inn) && !normalize(r.inn).includes(normalize(p.inn))) return false;
    if (has(p.ogrn) && !normalize(r.ogrn).includes(normalize(p.ogrn))) return false;

    if (p.marked != null && !!r.marked !== p.marked) return false;
    return true;
  };
}

export function sortRecords(records, p) {
  const field = p.sortField;
  const dir = p.sortDir;
  const get = (r) => {
    if (field === 'name') return r.name.toUpperCase();
    if (field === 'dob') return r.dob ? toNumDate(r.dob) : null;
    if (field === 'yob') return r.yob;
    if (field === 'date') return r.date;
    return r.id;
  };
  return [...records].sort((a, b) => {
    const av = get(a);
    const bv = get(b);
    if (av == null && bv == null) return a.id - b.id;
    if (av == null) return 1;
    if (bv == null) return -1;
    let c;
    if (field === 'name') c = av.localeCompare(bv, 'ru');
    else c = av - bv;
    return dir * c;
  });
}

export function paginate(records, p) {
  const total = records.length;
  const start = p.offset != null ? p.offset : (p.page - 1) * p.limit;
  const items = records.slice(start, start + p.limit);
  const pages = Math.ceil(total / p.limit);
  return {
    total,
    page: p.page,
    limit: p.limit,
    offset: start,
    pages,
    items,
  };
}