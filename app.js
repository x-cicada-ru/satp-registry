(function () {
  'use strict';

  const MANIFEST = window.__MANIFEST || [];
  const md = window.markdownit({ html: false, linkify: false, breaks: true });

  const $ = (s) => document.querySelector(s);

  const SECTIONS = window.__S || (window.__S = {});        // loaded chunks
  const SECTION_META = {};                  // key -> manifest meta
  for (const m of MANIFEST) SECTION_META[m.k] = m;

  // fetch a raw text file at an (already encoded) URL
  function fetchUrl(url) {
    return fetch(url).then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    });
  }

  // delegate for raw md fetch by vault path
  function fetchText(pathStr) {
    return fetchUrl(pathStr.split('/').map(encodeURIComponent).join('/'));
  }

  // ---------- data loading ----------
  const loading = {};
  let loadedCount = 0;
  function loadSection(key) {
    if (SECTIONS[key]) return Promise.resolve(SECTIONS[key]);
    if (loading[key]) return loading[key];
    loading[key] = new Promise((resolve, reject) => {
      const url = 'data/' + encodeURIComponent(key) + '.js';
      fetchUrl(url).then((code) => {
        try {
          (0, eval)(code);
          loadedCount++;
          const cnt = $('#loaded');
          if (cnt) cnt.textContent = loadedCount;
          resolve(SECTIONS[key]);
        } catch (e) { reject(e); }
      }).catch(reject);
    });
    return loading[key];
  }

  function loadAll(onProgress) {
    const keys = MANIFEST.map((m) => m.k);
    let i = 0;
    return keys.reduce((p, k) => p.then(() => {
      return loadSection(k).then(() => {
        i++;
        if (onProgress) onProgress(i, keys.length);
      });
    }), Promise.resolve()).then(() => keys.length);
  }

  // ---------- helpers ----------
  function enc(p) { return p.split('/').map(encodeURIComponent).join('/'); }
  function norm(p) { return p.replace(/^\.?\//, ''); }
  function urlFor(p) { return '#/' + enc(p); }
  function base(pathStr) { return pathStr.split('/').pop() || ''; }
  function stripMd(s) { return s.replace(/\.md$/i, ''); }

  function entry(key, pathStr) {
    const arr = SECTIONS[key];
    if (!arr) return null;
    return arr.find((e) => e.p === pathStr) || null;
  }
  function entryByTitle(key, title) {
    const arr = SECTIONS[key];
    if (!arr) return null;
    return arr.find((e) => e.t === title) || null;
  }
  function allEntries() {
    const out = [];
    for (const k of Object.keys(SECTIONS)) for (const e of SECTIONS[k]) out.push({ k, ...e });
    return out;
  }

  // title -> candidates across loaded sections
  function findByTitle(title) {
    const res = [];
    for (const k of Object.keys(SECTIONS)) {
      const e = entryByTitle(k, title);
      if (e) res.push({ k, e });
    }
    return res;
  }

  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  // ---------- routing ----------
  function parseHash() {
    return norm(decodeURIComponent((location.hash || '').replace(/^#\//, '')));
  }
  function isNotePath(p) {
    return p.toLowerCase().endsWith('.md');
  }

  // ---------- sidebar tree ----------
  function treeHTML() {
    const h = [];
    h.push('<div class="node" data-path=""><span class="car">▾</span><span class="ico">🗂</span><span class="nm">Все файлы</span><span class="n">' + fmt(MANIFEST.reduce((a, m) => a + m.count, 0)) + '</span></div>');

    // meta section files
    const metaRoot = ['Организации.md', 'Физ лица.md'];
    for (const f of metaRoot) {
      h.push('<div class="node" data-path="' + esc(f) + '"><span class="car"></span><span class="ico">📄</span><span class="nm">' + esc(stripMd(f)) + '</span></div>');
    }
    // Организации folder
    const org = SECTION_META['org'];
    if (org) {
      h.push('<div class="node" data-path="Организации/"><span class="car">▾</span><span class="ico">📁</span><span class="nm">Организации</span><span class="n">' + fmt(org.count) + '</span></div>');
    }
    // Физ лица + letters
    const fzTotal = MANIFEST.filter((m) => m.k !== 'meta' && m.k !== 'org').reduce((a, m) => a + m.count, 0);
    h.push('<div class="node fz" data-path="Физ лица/"><span class="car">▾</span><span class="ico">📁</span><span class="nm">Физ лица</span><span class="n">' + fmt(fzTotal) + '</span></div>');
    h.push('<div class="children fz-ch" style="display:none">');
    for (const m of MANIFEST) {
      if (m.k === 'meta' || m.k === 'org') continue;
      h.push('<div class="node" data-path="Физ лица/Заметки/' + m.k + '/"><span class="car"></span><span class="ico">📁</span><span class="nm">' + esc(m.k) + '</span><span class="n">' + fmt(m.count) + '</span></div>');
    }
    h.push('</div>');
    return h.join('');
  }

  function fmt(n) {
    return n.toLocaleString('ru-RU');
  }

  function bindTree() {
    $('#tree').innerHTML = treeHTML();
    const nodes = $('#tree').querySelectorAll('.node');
    nodes.forEach((n) => {
      const p = n.getAttribute('data-path');
      if (p === null || p === undefined) return;
      n.addEventListener('click', (ev) => {
        const car = ev.target.classList.contains('car');
        if (car) {
          const fzCh = n.parentElement && n.parentElement.querySelector('.children.fz-ch');
          if (fzCh) {
            const open = fzCh.style.display !== 'none';
            fzCh.style.display = open ? 'none' : 'block';
            n.querySelector('.car').textContent = open ? '▸' : '▾';
            return;
          }
        }
        location.hash = '#' + (p.endsWith('/') ? '/' + enc(p) : '/' + enc(p));
      });
    });
    markChosen();
  }

  // ---------- views ----------
  function crumbs(pathStr) {
    if (!pathStr) return '';
    const parts = pathStr.split('/');
    let acc = '';
    return '<div class="crumbs">' + parts.map((p) => {
      acc = acc ? acc + '/' + p : p;
      return '<a href="' + urlFor(acc) + '">' + esc(p.replace(/\.md$/i, '')) + '</a>';
    }).join('<span class="sep">/</span>') + '</div>';
  }

  function renderHome() {
    const total = MANIFEST.reduce((a, m) => a + m.count, 0);
    $('#content').innerHTML =
      '<div class="home">' +
      '<h1>Реестр</h1>' +
      '<p class="hint">' + fmt(total) + ' записей · только .md · поиск в верхней панели</p>' +
      '<div class="home-cards">' +
      '<a class="home-card" href="#/Организации.md">Организации</a>' +
      '<a class="home-card" href="#/Физ лица.md">Физ лица</a>' +
      '</div></div>';
  }

  function renderDir(pathStr) {
    const pathT = norm(pathStr).replace(/\/+$/, '');
    const el = $('#content');

    // top-level root: show index files + folders
    if (pathT === '') {
      const loaders = [loadSection('meta')];
      Promise.all(loaders).then(() => {
        let html = crumbs('');
        html += '<p class="hint">Вершина реестра</p>';
        for (const f of ['Организации.md', 'Физ лица.md']) {
          html += '<div class="fsLine">📄 <a href="' + urlFor(f) + '">' + esc(stripMd(f)) + '</a></div>';
        }
        html += '<div class="fsLine">📁 <a href="#/Организации/Заметки/">Организации · Заметки</a> <span class="n">· ' + fmt((SECTION_META['org'] || { count: 0 }).count) + '</span></div>';
        html += '<div class="fsLine">📁 <a href="#/Физ лица/">Физ лица</a></div>';
        el.innerHTML = html;
      });
      return;
    }

    if (pathT === 'Физ лица' || pathT === 'Физ лица/Заметки') {
      renderLetters(el, pathT);
      return;
    }

    // determine candidate section keys
    const candKeys = [];
    if (pathT === 'Организации' || pathT.startsWith('Организации/')) candKeys.push('org');
    else {
      const mm = pathT.match(/^Физ лица\/Заметки\/(.)(?:\/|$)/);
      const key = mm ? mm[1] : null;
      if (key) candKeys.push(key);
      else if (pathT.startsWith('Физ лица/')) { renderLetters(el, pathT); return; }
    }

    Promise.all(candKeys.map((k) => loadSection(k))).then(() => {
      let files = [];
      for (const k of candKeys) {
        const arr = SECTIONS[k] || [];
        for (const e of arr) {
          if (e.p.startsWith(pathT + '/') && !e.p.slice(pathT.length + 1).includes('/')) files.push(e);
        }
      }
      // subdirs
      const subdirs = new Set();
      for (const k of candKeys) {
        const arr = SECTIONS[k] || [];
        for (const e of arr) {
          if (e.p.startsWith(pathT + '/')) {
            const rest = e.p.slice(pathT.length + 1);
            const seg = rest.split('/')[0];
            if (seg && rest.includes('/')) subdirs.add(seg);
          }
        }
      }

      let html = crumbs(pathStr);
      if (subdirs.size) {
        html += '<div class="fsList">';
        for (const d of [...subdirs].sort((a, b) => a.localeCompare(b, 'ru'))) {
          html += '<div class="fsLine">📁 <a href="' + urlFor(pathT + '/' + d + '/') + '">' + esc(d) + '</a></div>';
        }
        html += '</div>';
      }
      if (files.length) {
        html += '<p class="hint">' + fmt(files.length) + ' ' + plural(files.length, 'запись', 'записи', 'записей') + '</p><ul class="fsList">';
        for (const f of files.sort((a, b) => a.t.localeCompare(b.t, 'ru', { numeric: true }))) {
          html += '<li class="fsLine"><a href="' + urlFor(f.p) + '">' + esc(f.t) + '</a></li>';
        }
        html += '</ul>';
      }
      if (!files.length && !subdirs.size) html += '<div class="empty">Пусто.</div>';
      el.innerHTML = html;
    });
  }

  function renderLetters(el, pathT) {
    let html = crumbs(pathT || '');
    html += '<p class="hint">Разделы по алфавиту</p><div class="fsList">';
    for (const m of MANIFEST) {
      if (m.k === 'meta' || m.k === 'org') continue;
      html += '<div class="fsLine">📁 <a href="' + urlFor('Физ лица/Заметки/' + m.k + '/') + '">' + esc(m.k) + '</a> <span class="n">· ' + fmt(m.count) + '</span></div>';
    }
    html += '<div class="fsLine">📁 <a href="#/Организации/Заметки/">Организации · Заметки</a> <span class="n">· ' + fmt((SECTION_META['org'] || { count: 0 }).count) + '</span></div>';
    html += '</div>';
    el.innerHTML = html;
  }

  // ---------- note rendering ----------
  function keyOf(pathStr) {
    if (pathStr === 'Организации.md' || pathStr === 'Физ лица.md') return 'meta';
    if (pathStr.startsWith('Организации/')) return 'org';
    const m = pathStr.match(/^Физ лица\/Заметки\/(.)\//);
    return m ? m[1] : null;
  }

  // resolve wikilinks inside markdown to markdown links
  function resolveWikilinks(body) {
    return body.replace(/\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (m, target, label) => {
      const t = target.trim();
      const text = (label || t).trim().replace(/[\[\]]/g, '');
      // single letter -> letter index page
      if (/^[А-ЯЁЙ][a-z]?$/i.test(t) && SECTION_META[stripMd(t)]) {
        return '[' + esc(text) + '](#/' + enc('Физ лица/Заметки/' + stripMd(t) + '/' + stripMd(t) + '.md') + ')';
      }
      // numeric org entry -> org section (loaded on index page)
      if (/^\d/.test(t)) {
        const oe = SECTIONS['org'] && entryByTitle('org', stripMd(t));
        if (oe) return '[' + esc(text) + '](#/' + enc(oe.p) + ')';
        return text;
      }
      let hit = null;
      const cand = findByTitle(stripMd(t));
      if (cand.length) hit = cand[0].e.p;
      if (!hit) return text;
      return '[' + esc(text) + '](#/' + enc(hit) + ')';
    });
  }

  function propsHTML(text) {
    const m = text.match(/^---\n([\s\S]*?)\n---/);
    if (!m) return '';
    const rows = [];
    for (const line of m[1].split('\n')) {
      const kv = line.match(/^([\wа-яА-ЯёЁ]+):\s*(.*)$/);
      if (kv) {
        const val = kv[2].replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').trim();
        if (val === '' || val === '[]') continue;
        rows.push('<div class="props-row"><div class="k">' + esc(kv[1]) + '</div><div class="v">' + esc(val) + '</div></div>');
      }
    }
    if (!rows.length) return '';
    return '<div class="props"><div class="props-head">Свойства</div>' + rows.join('') + '</div>';
  }

  function renderNote(pathStr) {
    const key = keyOf(pathStr);
    const el = $('#content');
    if (!key) { el.innerHTML = crumbs(pathStr) + '<div class="empty">Неизвестный раздел</div>'; return; }
    loadSection(key).then(() => {
      const e = entry(key, pathStr);
      // preload sibling sections so wikilinks resolve (org index needs org-numeric entries)
      const preload = [];
      if (e && e.p === 'Организации.md') preload.push(loadSection('org'));
      const e2 = e || entryByTitle(key, stripMd(pathStr));
      if (!e2) {
        el.innerHTML = crumbs(pathStr) + '<div class="empty">Файл не найден в секции ' + esc(key) + '</div>';
        return;
      }
      Promise.all(preload).then(() => {
        const link = urlFor(e2.p);
        fetchText(e2.p).then((raw) => {
          const props = propsHTML(raw);
          const body = raw.replace(/^---[\s\S]*?---\s*/, '');
          const rendered = md.render(resolveWikilinks(body));
          const html = crumbs(e2.p) +
            '<article class="note"><h1>' + esc(e2.t) + '</h1>' + props +
            '<div class="md-body">' + rendered + '</div>';
          el.innerHTML = html;
          document.title = e2.t + ' · Реестр';
          renderPane(e2, urlFor(e2.p));
        }).catch(() => { el.innerHTML = crumbs(e2.p) + '<div class="empty">Не удалось загрузить файл.</div>'; });
      });
    }).catch(() => {
      el.innerHTML = crumbs(pathStr) + '<div class="empty">Секция не загрузилась: ' + esc(key) + '</div>';
    });
  }

  function bindRefs() {
    $('#content').querySelectorAll('a[data-href]').forEach((a) => {
      a.addEventListener('click', (ev) => { ev.preventDefault(); location.hash = a.getAttribute('data-href'); });
    });
  }

  // ---------- right pane: properties/links ----------
  const paneMode = 'links';
  function renderPane(e, link) {
    const pane = $('#pane');
    const title = $('#paneTitle');
    pane.classList.remove('hidden');
    title.textContent = e.t;
    const outLinks = e.l || [];
    const inLinks = e.b || [];
    const b = ['<div class="pane-tab">',
      '<button class="on" data-tab="links">Связи</button>',
      '<button data-tab="todo">История</button>',
      '</div>'];
    b.push('<div class="pane-body-tab" id="tab-links">');
    b.push('<div class="side-head">Исходящие · ' + outLinks.length + '</div>');
    if (outLinks.length) {
      b.push('<ul class="plist">');
      for (const p of outLinks.slice(0, 60)) {
        b.push('<li><a href="' + urlFor(p) + '">' + esc(stripMd(base(p))) + '</a></li>');
      }
      if (outLinks.length > 60) b.push('<li class="cnt">и ещё ' + (outLinks.length - 60) + '…</li>');
      b.push('</ul>');
    } else b.push('<div class="empty">Нет исходящих</div>');
    b.push('<div class="side-head">Входящие · ' + inLinks.length + '</div>');
    if (inLinks.length) {
      b.push('<ul class="plist">');
      for (const p of inLinks.slice(0, 60)) {
        b.push('<li><a href="' + urlFor(p) + '">' + esc(stripMd(base(p))) + '</a></li>');
      }
      if (inLinks.length > 60) b.push('<li class="cnt">и ещё ' + (inLinks.length - 60) + '…</li>');
      b.push('</ul>');
    } else b.push('<div class="empty">Нет входящих</div>');
    b.push('</div>');
    b.push('<div class="pane-body-tab" id="tab-todo" style="display:none"><div class="empty">История изменений недоступна для статического экспорта.</div></div>');
    $('#paneBody').innerHTML = b.join('');
    $('#paneBody').querySelectorAll('.pane-tab button').forEach((btn) => {
      btn.addEventListener('click', () => {
        $('#paneBody').querySelectorAll('.pane-tab button').forEach((x) => x.classList.remove('on'));
        btn.classList.add('on');
        const tab = btn.getAttribute('data-tab');
        $('#tab-links').style.display = tab === 'links' ? '' : 'none';
        $('#tab-todo').style.display = tab === 'todo' ? '' : 'none';
        if (tab === 'goto') { /* nothing */ }
      });
    });
  }

  // ---------- search ----------
  const search = $('#search');
  let searchTimer = null;
  let allLoaded = false;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = search.value.trim();
    searchTimer = setTimeout(() => doSearch(q), 120);
  });
  search.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { clearTimeout(searchTimer); doSearch(search.value.trim()); }
  });

  function doSearch(q) {
    if (!q) { route(); return; }
    const el = $('#content');
    el.innerHTML = '<div class="empty" id="ld">Загрузка индекса…</div>';
    const proc = (i, n) => {
      const bar = $('#ld'); if (bar) bar.textContent = 'Загрузка индекса… ' + i + '/' + n;
    };
    const run = () => {
      const ql = q.toLowerCase();
      let res = [];
      for (const k of Object.keys(SECTIONS)) {
        for (const e of SECTIONS[k]) {
          if (e.t.toLowerCase().includes(ql)) res.push({ k, ...e });
          if (res.length > 800) break;
        }
        if (res.length > 800) break;
      }
      el.innerHTML = crumbs('') + '<div class="search-res">' +
        '<p class="hint">Найдено: ' + fmt(res.length) + (res.length >= 800 ? '+' : '') + '</p>';
      const list = document.createElement('div');
      window.__res = res;
      for (const r of res) {
        const d = document.createElement('div');
        d.className = 'sr-item';
        d.innerHTML = '<div class="t">' + esc(r.t) + '</div><div class="p">' + esc(r.p) + '</div>';
        d.addEventListener('click', () => { location.hash = urlFor(r.p); });
        list.appendChild(d);
      }
      el.appendChild(list);
    };
    if (allLoaded) { run(); return; }
    loadAll(proc).then(() => { allLoaded = true; run(); });
  }

  // ---------- graph ----------
  const graphWrap = document.createElement('div');
  graphWrap.className = 'graph-wrap';
  graphWrap.innerHTML =
    '<div class="graph-toolbar">' +
    '<span class="gg-title">Граф</span>' +
    '<button class="btn active" id="gModeLocal">Локальный</button>' +
    '<button class="btn" id="gModeFull">Все записи</button>' +
    '<span class="gg-title" id="gStatus"></span>' +
    '<span style="flex:1"></span>' +
    '<button class="btn" id="gClose">✕ Закрыть</button>' +
    '</div>' +
    '<div class="graph-canvas-wrap">' +
    '<div id="graphLoading">Загрузка данных…</div>' +
    '<canvas id="graphCanvas"></canvas>' +
    '<div class="legend" id="gLegend"></div>' +
    '</div>';
  document.body.appendChild(graphWrap);

  const gCanvas = $('#graphCanvas');
  const gctx = gCanvas.getContext('2d');
  const gLoading = $('#graphLoading');
  const gStatus = $('#gStatus');

  const SECTION_COLOR = (key) => {
    if (key === 'meta') return '#7d9dc9';
    if (key === 'org') return '#c97d5f';
    let h = 0;
    for (const c of key) h = (h * 31 + c.codePointAt(0)) % 360;
    return 'hsl(' + h + ', 45%, 62%)';
  };

  function legendHTML(sets) {
    let h = '';
    for (const [k, color] of sets) {
      if (k === '_') continue;
      const label = k === 'meta' ? 'Индексы' : k === 'org' ? 'Организации' : 'Физ лица · ' + k;
      h += '<div class="lg"><span class="dot" style="background:' + color + '"></span>' + esc(label) + '</div>';
    }
    return h;
  }

  function openGraph() {
    $('#gClose').onclick = () => { graphWrap.classList.remove('on'); };
    $('#gModeLocal').onclick = () => { activeMode = 'local'; $('#gModeLocal').classList.add('active'); $('#gModeFull').classList.remove('active'); startGraph(); };
    $('#gModeFull').onclick = () => { activeMode = 'full'; $('#gModeFull').classList.add('active'); $('#gModeLocal').classList.remove('active'); startGraph(); };
    graphWrap.classList.add('on');
    startGraph();
  }

  let activeMode = 'local';

  function startGraph() {
    const cur = parseHash();
    if (activeMode === 'local' && (cur === '' && !isNotePath(cur))) {
      gStatus.textContent = 'Откройте заметку, чтобы построить локальный граф';
      gLoading.style.display = 'flex';
      gLoading.textContent = 'Откройте запись, чтобы увидеть граф';
      return;
    }
    gLoading.style.display = 'flex';
    gLoading.textContent = activeMode === 'full' ? 'Загрузка всех данных…' : 'Построение локального графа…';
    if (activeMode === 'full') {
      loadAll((i, n) => { gLoading.textContent = 'Загрузка всех данных… ' + i + '/' + n; })
        .then(() => { if (activeMode === 'full') buildFullGraph(); });
    } else {
      buildLocalGraph(cur);
    }
  }

  // build local graph neighborhood (1 hop)
  function buildLocalGraph(pathStr) {
    const key = keyOf(pathStr);
    loadSection(key).then(() => {
      const root = entry(key, pathStr) || entryByTitle(key, stripMd(pathStr));
      if (!root) { gLoading.textContent = 'Запись не найдена'; return; }
      const nodes = new Map(); // path -> node
      const edges = [];        // [a,b]
      const add = (p, isRoot) => {
        if (!p || nodes.has(p)) return;
        const kk = keyOf(p) || key;
        nodes.set(p, { path: p, title: stripMd(base(p)), key: kk, fixed: isRoot, r: isRoot ? 7 : 4 });
      };
      add(root.p, true);
      const seen = new Set([root.p]);
      const addLinks = (e, dir) => {
        const arr = dir === 'out' ? (e.l || []) : (e.b || []);
        for (const t of arr) {
          add(t, false);
          if (dir === 'out') edges.push([e.p, t]);
        }
      };
      addLinks(root, 'out');
      addLinks(root, 'in');

      // second hop for small graphs
      if (nodes.size < 140) {
        for (const [pnt, nd] of nodes) {
          if (pnt === root.p) continue;
          const e2 = entry(nd.key, pnt);
          if (!e2) continue;
          addLinks(e2, 'out');
          addLinks(e2, 'in');
        }
      }
      renderGraph(nodes, edges, root.p);
    });
  }

  // full graph with cap, sampled evenly across sections
  function buildFullGraph() {
    const nodes = new Map();
    const edges = [];
    const cap = 1400;
    const keys = Object.keys(SECTIONS);
    const per = Math.max(1, Math.floor(cap / keys.length));
    for (const k of keys) {
      const arr = SECTIONS[k] || [];
      const take = Math.min(arr.length, per);
      for (let i = 0; i < take; i++) {
        const e = arr[i];
        nodes.set(e.p, { path: e.p, title: e.t, key: k, r: 2 });
      }
      if (nodes.size >= cap) break;
    }
    for (const [p, nd] of nodes) {
      const arr = SECTIONS[nd.key] || [];
      const e = arr.find((x) => x.p === p);
      if (!e) continue;
      for (const t of (e.l || [])) if (nodes.has(t)) edges.push([p, t]);
    }
    renderGraph(nodes, edges, null, true);
  }

  // canvas kinetic simulation
  function renderGraph(nodesMap, edges, rootPath, isFull) {
    gLoading.style.display = 'none';
    const nodes = [...nodesMap.values()];
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].x = (Math.random() - 0.5) * 600;
      nodes[i].y = (Math.random() - 0.5) * 400;
      nodes[i].vx = 0; nodes[i].vy = 0;
      nodes[i].idx = i;
    }
    const edgeList = edges.map(([a, b]) => [nodesMap.get(a), nodesMap.get(b)]).filter(([a, b]) => a && b);

    // colors by section
    const colors = new Map();
    for (const n of nodes) if (!colors.has(n.key)) colors.set(n.key, SECTION_COLOR(n.key));
    $('#gLegend').innerHTML = legendHTML(colors);
    if (isFull) $('#gLegend').innerHTML += '<div class="lg"><span class="dot" style="background:#444"></span>показано ' + fmt(nodes.length) + ' записей</div>';

    const W = () => gCanvas.clientWidth;
    const H = () => gCanvas.clientHeight;
    const dpr = () => window.devicePixelRatio || 1;
    function resize() {
      gCanvas.width = W() * dpr();
      gCanvas.height = H() * dpr();
      gctx.setTransform(dpr(), 0, 0, dpr(), 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    let zoom = 1, ox = W() / 2, oy = H() / 2;
    let hoverNode = null, dragNode = null;
    let dragging = false, px = 0, py = 0, moved = false;
    let raf = null, cooling = 1;

    const s2x = (x) => x * zoom + ox;
    const s2y = (y) => y * zoom + oy;
    const s2xx = (sx) => (sx - ox) / zoom;
    const s2yy = (sy) => (sy - oy) / zoom;

    function step() {
      const grid = new Map();
      const cell = 120;
      const gx = (x) => Math.floor(x / cell);
      for (const n of nodes) {
        const k = gx(n.x) + ',' + gx(n.y);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(n);
      }
      function nearby(x, y) {
        const out = [];
        for (let ix = gx(x) - 1; ix <= gx(x) + 1; ix++) {
          for (let iy = gx(y) - 1; iy <= gx(y) + 1; iy++) {
            const cell2 = grid.get(ix + ',' + iy);
            if (cell2) for (const n of cell2) out.push(n);
          }
        }
        return out;
      }

      const kRep = 1600, kSpr = 0.06, rest = 44, damp = 0.8;
      for (const n of nodes) {
        if (n.fixed && !dragNode) { n.vx *= 0.5; n.vy *= 0.5; continue; }
        let fx = 0, fy = 0;
        for (const m of nearby(n.x, n.y)) {
          if (m === n) continue;
          const dx = n.x - m.x, dy = n.y - m.y;
          const d2 = dx * dx + dy * dy + 0.5;
          const d = Math.sqrt(d2);
          const f = kRep / d2;
          fx += (dx / d) * f;
          fy += (dy / d) * f;
        }
        fx -= n.x * 0.02;
        fy -= n.y * 0.02;
        n.vx = (n.vx + fx) * damp;
        n.vy = (n.vy + fy) * damp;
        if (dragNode === n) { n.vx *= 0.05; n.vy *= 0.05; }
        n.x += n.vx; n.y += n.vy;
      }
      for (const [a, b] of edgeList) {
        if (a.fixed === b.fixed) continue;
        const mov = a.fixed ? b : a;
        if (mov.fixed) continue;
        const fx2 = b.x - a.x, fy2 = b.y - a.y;
        const d = Math.sqrt(fx2 * fx2 + fy2 * fy2) || 1;
        const f = (d - rest) * kSpr * 0.9;
        mov.vx += (fx2 / d) * f; mov.vy += (fy2 / d) * f;
      }
      if (nodes.length < 1200) cooling = Math.max(0.28, cooling * 0.994);
      else cooling = Math.max(0.45, cooling * 0.997);
      draw();
      if (cooling > 0.3 || dragNode) {
        raf = requestAnimationFrame(step);
      }
    }

    function draw() {
      gctx.clearRect(0, 0, W(), H());
      gctx.save();
      gctx.translate(ox, oy);
      gctx.scale(zoom, zoom);

      const friendSet = new Set();
      if (hoverNode) {
        for (const [a, b] of edgeList) {
          if (a === hoverNode) friendSet.add(b);
          if (b === hoverNode) friendSet.add(a);
        }
        friendSet.add(hoverNode);
      }

      // edges
      gctx.lineWidth = 1 / zoom;
      for (const [a, b] of edgeList) {
        const hl = hoverNode && (a === hoverNode || b === hoverNode);
        gctx.strokeStyle = hl ? 'rgba(255,255,255,0.55)' : 'rgba(180,180,180,0.18)';
        gctx.beginPath();
        gctx.moveTo(a.x, a.y);
        gctx.lineTo(b.x, b.y);
        gctx.stroke();
      }

      // nodes
      for (const n of nodes) {
        const color = colors.get(n.key);
        if (hoverNode && !friendSet.has(n)) {
          gctx.globalAlpha = 0.12;
        } else {
          gctx.globalAlpha = 1;
        }
        gctx.fillStyle = color;
        gctx.beginPath();
        gctx.arc(n.x, n.y, n.r / zoom, 0, Math.PI * 2);
        gctx.fill();
      }
      gctx.globalAlpha = 1;
      gctx.restore();

      // labels for hover
      if (hoverNode) {
        gctx.fillStyle = 'rgba(20,20,20,0.85)';
        const sx = s2x(hoverNode.x), sy = s2y(hoverNode.y);
        const label = hoverNode.title;
        gctx.font = '12px sans-serif';
        const w = gctx.measureText(label).width + 16;
        gctx.fillRect(sx + 10, sy + 10, w, 24);
        gctx.fillStyle = '#eee';
        gctx.fillText(label, sx + 18, sy + 26);
      }
    }

    gCanvas.addEventListener('pointermove', (ev) => {
      const sx = ev.offsetX, sy = ev.offsetY;
      if (dragging) {
        if (dragNode) {
          dragNode.x = s2xx(sx); dragNode.y = s2yy(sy);
          if (!raf) raf = requestAnimationFrame(step);
        } else {
          ox += sx - px; oy += sy - py;
        }
        px = sx; py = sy; moved = true;
        draw();
        return;
      }
      hoverNode = null;
      for (const n of nodes) {
        const d = Math.hypot(s2x(n.x) - sx, s2y(n.y) - sy);
        if (d < 12) { hoverNode = n; break; }
      }
      draw();
    });

    gCanvas.addEventListener('pointerdown', (ev) => {
      dragging = true; moved = false; px = ev.offsetX; py = ev.offsetY;
      gCanvas.setPointerCapture(ev.pointerId);
      dragNode = null;
      for (const n of nodes) {
        const d = Math.hypot(s2x(n.x) - px, s2y(n.y) - py);
        if (d < 12) { dragNode = n; break; }
      }
    });

    gCanvas.addEventListener('pointerup', (ev) => {
      dragging = false;
      if (dragNode) { const t = dragNode; dragNode = null; raf = requestAnimationFrame(step); }
      if (!moved && hoverNode) navTo(hoverNode.path);
    });

    gCanvas.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const z = ev.deltaY < 0 ? 1.1 : 0.9;
      const sx = ev.offsetX, sy = ev.offsetY;
      zoom = Math.min(6, Math.max(0.15, zoom * z));
      ox = sx - (sx - ox) * z;
      oy = sy - (sy - oy) * z;
      draw();
    }, { passive: false });

    raf = requestAnimationFrame(step);
    draw();
  }

  function navTo(p) {
    location.hash = urlFor(p);
    if (graphWrap.classList.contains('on')) graphWrap.classList.remove('on');
  }

  // ---------- theme ----------
  function toggleTheme() {
    document.body.classList.toggle('light');
    $('#themeBtn').textContent = document.body.classList.contains('light') ? '☀' : '◐';
  }
  $('#themeBtn').onclick = toggleTheme;

  // ---------- init ----------
  function markChosen() {
    const cur = parseHash();
    document.querySelectorAll('#tree .node').forEach((n) => {
      n.classList.toggle('chosen', n.getAttribute('data-path') === cur || (cur && n.getAttribute('data-path') && cur.startsWith(n.getAttribute('data-path'))));
    });
  }

  function route() {
    const p = parseHash();
    const gbtn = document.createElement('div');
    markChosen();
    if (!p) return renderHome();
    if (isNotePath(p)) return renderNote(p);
    return renderDir(p);
  }

  $('#sideFoot').innerHTML =
    '<button class="btn" style="width:100%" id="loadAllBtn">Загрузить все данные</button>' +
    '<div style="padding-top:4px">Загружено секций: <span id="loaded">0</span>/' + MANIFEST.length + '</div>' +
    '<div class="graph-link-wrap" style="padding-top:6px"><button class="btn" style="width:100%" id="graphBtn">Граф</button></div>';

  $('#loadAllBtn').style.display = 'none';
  $('#graphBtn').onclick = openGraph;

  $('#count').textContent = '0';
  try { $('#count').textContent = MANIFEST.reduce((a, m) => a + m.count, 0).toLocaleString('ru-RU'); } catch (e) {}

  window.addEventListener('hashchange', route);
  bindTree();
  route();
})();