/* ============================================================
   Nafa — app de budget personnel (FCFA)
   Étape 1 : socle — opérations, catégories, tableau de bord
   Données 100% locales (IndexedDB). Rien n'est envoyé en ligne.
   ============================================================ */
(() => {
  'use strict';

  /* ---------------- IndexedDB (mini wrapper) ---------------- */
  const DB_NAME = 'nafa';
  const DB_VERSION = 1;
  let db = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('categories')) {
          d.createObjectStore('categories', { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains('operations')) {
          const os = d.createObjectStore('operations', { keyPath: 'id' });
          os.createIndex('date', 'date');
        }
        if (!d.objectStoreNames.contains('settings')) {
          d.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function tx(store, mode) {
    return db.transaction(store, mode).objectStore(store);
  }
  function getAll(store) {
    return new Promise((res, rej) => {
      const r = tx(store, 'readonly').getAll();
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  function put(store, value) {
    return new Promise((res, rej) => {
      const r = tx(store, 'readwrite').put(value);
      r.onsuccess = () => res(value);
      r.onerror = () => rej(r.error);
    });
  }
  function del(store, key) {
    return new Promise((res, rej) => {
      const r = tx(store, 'readwrite').delete(key);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
  }

  /* ---------------- Catégories par défaut ---------------- */
  const DEFAULT_CATEGORIES = [
    // dépenses
    { name: 'Loyer / Maison', icon: '🏠', color: '#8b5cf6', type: 'expense' },
    { name: 'Factures',       icon: '⚡', color: '#f59e0b', type: 'expense' },
    { name: 'Alimentation',   icon: '🍚', color: '#10b981', type: 'expense' },
    { name: 'Transport',      icon: '🚕', color: '#3b82f6', type: 'expense' },
    { name: 'Famille',        icon: '👨‍👩‍👧', color: '#ec4899', type: 'expense' },
    { name: 'Scolarité',      icon: '📚', color: '#6366f1', type: 'expense' },
    { name: 'Santé',          icon: '🏥', color: '#ef4444', type: 'expense' },
    { name: 'Crédit tél.',    icon: '📱', color: '#06b6d4', type: 'expense' },
    { name: 'Achats',         icon: '🛍️', color: '#d946ef', type: 'expense' },
    { name: 'Loisirs',        icon: '🎉', color: '#f97316', type: 'expense' },
    { name: 'Épargne/Tontine',icon: '💰', color: '#0e7c66', type: 'expense' },
    // revenus
    { name: 'Salaire',        icon: '💼', color: '#0e7c66', type: 'income' },
    { name: 'Business',       icon: '🧺', color: '#16a34a', type: 'income' },
    { name: 'Aide',           icon: '🎁', color: '#22c55e', type: 'income' },
    { name: 'Autre revenu',   icon: '➕', color: '#84cc16', type: 'income' },
  ];

  /* ---------------- État ---------------- */
  const state = {
    categories: [],
    operations: [],
    addType: 'expense',
    addCatId: null,
    histPeriod: 'month',
    histCat: 'all',
  };

  /* ---------------- Helpers ---------------- */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const fmt = (n) => Math.round(n).toLocaleString('fr-FR').replace(/ /g, ' ') + ' FCFA';

  function todayISO() {
    const d = new Date();
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
  }
  function monthKey(iso) { return iso.slice(0, 7); }
  function currentMonthKey() { return todayISO().slice(0, 7); }

  const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet',
    'Août','Septembre','Octobre','Novembre','Décembre'];
  const DAYS_FR = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

  function monthLabel(key) {
    const [y, m] = key.split('-');
    return `${MONTHS_FR[+m - 1]} ${y}`;
  }
  function dayLabel(iso) {
    const d = new Date(iso + 'T00:00:00');
    const t = todayISO();
    if (iso === t) return "Aujourd'hui";
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (iso === y.toISOString().slice(0, 10)) return 'Hier';
    return `${DAYS_FR[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()].toLowerCase()}`;
  }
  function catById(id) { return state.categories.find((c) => c.id === id); }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 1800);
  }

  /* ---------------- Navigation ---------------- */
  function goto(screen) {
    $$('.screen').forEach((s) => { s.hidden = s.dataset.screen !== screen; });
    $$('.tabbar__btn').forEach((b) => b.classList.toggle('is-active', b.dataset.goto === screen));
    window.scrollTo(0, 0);
    if (screen === 'home') renderHome();
    if (screen === 'history') renderHistory();
    if (screen === 'settings') renderSettings();
    if (screen === 'add' && !$('#add-id').value) resetAddForm();
  }

  /* ---------------- Accueil ---------------- */
  function renderHome() {
    const mk = currentMonthKey();
    $('#home-month').textContent = monthLabel(mk);
    const ops = state.operations.filter((o) => monthKey(o.date) === mk);
    const revenus = ops.filter((o) => o.type === 'income').reduce((s, o) => s + o.amount, 0);
    const depenses = ops.filter((o) => o.type === 'expense').reduce((s, o) => s + o.amount, 0);
    const solde = revenus - depenses;

    $('#home-revenus').textContent = fmt(revenus);
    $('#home-depenses').textContent = fmt(depenses);
    $('#home-solde').textContent = fmt(solde);
    $('#home-saving').textContent = fmt(Math.max(solde, 0));

    const recent = [...state.operations]
      .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))
      .slice(0, 5);
    renderOpList($('#home-recent'), recent, false);
  }

  /* ---------------- Liste d'opérations ---------------- */
  function opRow(o) {
    const c = catById(o.categoryId);
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'op';
    btn.innerHTML = `
      <span class="op__icon" style="background:${(c?.color || '#999')}1f">${c?.icon || '❓'}</span>
      <span class="op__main">
        <span class="op__cat">${escapeHtml(c?.name || 'Sans catégorie')}</span>
        <span class="op__note">${escapeHtml(o.note || '')}</span>
      </span>
      <span class="op__amount ${o.type === 'income' ? 'is-in' : 'is-out'}">
        ${o.type === 'income' ? '+' : '–'} ${fmt(o.amount)}
      </span>`;
    btn.addEventListener('click', () => editOperation(o.id));
    li.appendChild(btn);
    return li;
  }

  function renderOpList(ul, ops, grouped) {
    ul.innerHTML = '';
    if (!ops.length) {
      ul.innerHTML = '<li class="empty">Aucune opération pour le moment.<br>Appuie sur « + » pour commencer.</li>';
      return;
    }
    if (!grouped) {
      ops.forEach((o) => ul.appendChild(opRow(o)));
      return;
    }
    let lastDay = null;
    ops.forEach((o) => {
      if (o.date !== lastDay) {
        lastDay = o.date;
        const h = document.createElement('li');
        h.className = 'op-day';
        h.textContent = dayLabel(o.date);
        ul.appendChild(h);
      }
      ul.appendChild(opRow(o));
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  /* ---------------- Écran Ajouter ---------------- */
  function renderCatGrid() {
    const grid = $('#add-cat-grid');
    grid.innerHTML = '';
    const cats = state.categories.filter((c) => c.type === state.addType);
    cats.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cat-chip' + (c.id === state.addCatId ? ' is-active' : '');
      b.innerHTML = `
        <span class="cat-chip__emoji" style="background:${c.color}1f">${c.icon}</span>
        <span class="cat-chip__name">${escapeHtml(c.name)}</span>`;
      b.addEventListener('click', () => { state.addCatId = c.id; renderCatGrid(); });
      grid.appendChild(b);
    });
  }

  function setAddType(type) {
    state.addType = type;
    $$('.type-toggle__btn').forEach((b) => b.classList.toggle('is-active', b.dataset.type === type));
    // garder la catégorie si compatible, sinon réinitialiser
    const c = catById(state.addCatId);
    if (!c || c.type !== type) state.addCatId = null;
    renderCatGrid();
  }

  function resetAddForm() {
    $('#add-id').value = '';
    $('#add-amount').value = '';
    $('#add-note').value = '';
    $('#add-date').value = todayISO();
    $('#add-title').textContent = 'Ajouter';
    $('#add-save').textContent = 'Enregistrer';
    $('#add-delete').hidden = true;
    state.addCatId = null;
    setAddType('expense');
  }

  function parseAmount(str) {
    const n = parseInt(String(str).replace(/[^\d]/g, ''), 10);
    return isNaN(n) ? 0 : n;
  }

  function editOperation(id) {
    const o = state.operations.find((x) => x.id === id);
    if (!o) return;
    goto('add');
    $('#add-id').value = o.id;
    $('#add-amount').value = o.amount.toLocaleString('fr-FR').replace(/ /g, ' ');
    $('#add-note').value = o.note || '';
    $('#add-date').value = o.date;
    $('#add-title').textContent = 'Modifier';
    $('#add-save').textContent = 'Enregistrer les modifications';
    $('#add-delete').hidden = false;
    state.addCatId = o.categoryId;
    setAddType(o.type);
  }

  async function saveOperation(e) {
    e.preventDefault();
    const amount = parseAmount($('#add-amount').value);
    if (amount <= 0) return toast('Entre un montant');
    if (!state.addCatId) return toast('Choisis une catégorie');
    const id = $('#add-id').value || uid();
    const existing = state.operations.find((x) => x.id === id);
    const op = {
      id,
      amount,
      categoryId: state.addCatId,
      type: state.addType,
      date: $('#add-date').value || todayISO(),
      note: $('#add-note').value.trim(),
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
    };
    await put('operations', op);
    if (existing) {
      Object.assign(existing, op);
      toast('Opération modifiée ✓');
    } else {
      state.operations.push(op);
      toast('Enregistré ✓');
    }
    resetAddForm();
    goto('home');
  }

  async function deleteOperation() {
    const id = $('#add-id').value;
    if (!id) return;
    if (!confirm('Supprimer cette opération ?')) return;
    await del('operations', id);
    state.operations = state.operations.filter((o) => o.id !== id);
    resetAddForm();
    toast('Supprimé');
    goto('history');
  }

  /* ---------------- Historique ---------------- */
  function periodFilter(ops) {
    const t = todayISO();
    if (state.histPeriod === 'day') return ops.filter((o) => o.date === t);
    if (state.histPeriod === 'month') return ops.filter((o) => monthKey(o.date) === currentMonthKey());
    if (state.histPeriod === 'week') {
      const now = new Date(t + 'T00:00:00');
      const day = (now.getDay() + 6) % 7; // lundi = 0
      const start = new Date(now); start.setDate(now.getDate() - day);
      const end = new Date(start); end.setDate(start.getDate() + 6);
      const s = start.toISOString().slice(0, 10), e = end.toISOString().slice(0, 10);
      return ops.filter((o) => o.date >= s && o.date <= e);
    }
    return ops; // all
  }

  function renderHistory() {
    // remplir le filtre catégories
    const sel = $('#cat-filter');
    if (sel.dataset.filled !== '1') {
      sel.innerHTML = '<option value="all">Toutes les catégories</option>' +
        state.categories.map((c) => `<option value="${c.id}">${c.icon} ${escapeHtml(c.name)}</option>`).join('');
      sel.dataset.filled = '1';
    }
    sel.value = state.histCat;

    let ops = periodFilter(state.operations);
    if (state.histCat !== 'all') ops = ops.filter((o) => o.categoryId === state.histCat);
    ops.sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));

    const dep = ops.filter((o) => o.type === 'expense').reduce((s, o) => s + o.amount, 0);
    const rev = ops.filter((o) => o.type === 'income').reduce((s, o) => s + o.amount, 0);
    const labels = { day: 'du jour', week: 'de la semaine', month: 'du mois', all: 'total' };
    $('#hist-total-label').textContent = `Solde ${labels[state.histPeriod]}`;
    $('#hist-total-value').textContent = fmt(rev - dep);

    renderOpList($('#history-list'), ops, true);
  }

  /* ---------------- Réglages : catégories ---------------- */
  function renderSettings() {
    ['expense', 'income'].forEach((type) => {
      const ul = $(`#cat-list-${type}`);
      ul.innerHTML = '';
      state.categories.filter((c) => c.type === type).forEach((c) => {
        const li = document.createElement('li');
        li.className = 'cat-row';
        li.innerHTML = `
          <span class="cat-row__emoji">${c.icon}</span>
          <span class="cat-row__name">${escapeHtml(c.name)}</span>
          <button class="cat-row__btn edit" title="Modifier">✏️</button>
          <button class="cat-row__btn del" title="Supprimer">🗑️</button>`;
        li.querySelector('.edit').addEventListener('click', () => openCatModal(c));
        li.querySelector('.del').addEventListener('click', () => removeCategory(c));
        ul.appendChild(li);
      });
    });
  }

  function openCatModal(cat) {
    $('#cat-modal-id').value = cat ? cat.id : '';
    $('#cat-modal-name').value = cat ? cat.name : '';
    $('#cat-modal-icon').value = cat ? cat.icon : '';
    $('#cat-modal-type').value = cat ? cat.type : 'expense';
    $('#cat-modal-type').disabled = !!cat; // type non modifiable après coup
    $('#cat-modal-title').textContent = cat ? 'Modifier la catégorie' : 'Nouvelle catégorie';
    $('#cat-modal').hidden = false;
  }
  function closeCatModal() { $('#cat-modal').hidden = true; }

  const PALETTE = ['#0e7c66','#3b82f6','#f59e0b','#ec4899','#8b5cf6','#ef4444','#10b981','#06b6d4','#f97316'];
  async function saveCatModal() {
    const name = $('#cat-modal-name').value.trim();
    if (!name) return toast('Donne un nom');
    const id = $('#cat-modal-id').value || uid();
    const existing = catById(id);
    const cat = {
      id,
      name,
      icon: $('#cat-modal-icon').value.trim() || (existing ? existing.icon : '🏷️'),
      type: $('#cat-modal-type').value,
      color: existing ? existing.color : PALETTE[state.categories.length % PALETTE.length],
      order: existing ? existing.order : (Math.max(0, ...state.categories.map((c) => c.order ?? 0)) + 1),
    };
    await put('categories', cat);
    if (existing) Object.assign(existing, cat);
    else state.categories.push(cat);
    $('#cat-filter').dataset.filled = ''; // refaire le filtre historique
    closeCatModal();
    renderSettings();
    toast('Catégorie enregistrée ✓');
  }

  async function removeCategory(cat) {
    const used = state.operations.some((o) => o.categoryId === cat.id);
    if (used) {
      return alert("Cette catégorie est utilisée par des opérations. " +
        "Modifie ou supprime d'abord ces opérations.");
    }
    if (!confirm(`Supprimer la catégorie « ${cat.name} » ?`)) return;
    await del('categories', cat.id);
    state.categories = state.categories.filter((c) => c.id !== cat.id);
    $('#cat-filter').dataset.filled = '';
    renderSettings();
    toast('Catégorie supprimée');
  }

  /* ---------------- Câblage des événements ---------------- */
  function wire() {
    $$('[data-goto]').forEach((b) => b.addEventListener('click', () => goto(b.dataset.goto)));
    $$('[data-period]').forEach((b) => b.addEventListener('click', () => {
      state.histPeriod = b.dataset.period;
      $$('[data-period]').forEach((x) => x.classList.toggle('is-active', x === b));
      renderHistory();
    }));
    $('#cat-filter').addEventListener('change', (e) => { state.histCat = e.target.value; renderHistory(); });

    $$('.type-toggle__btn').forEach((b) => b.addEventListener('click', () => setAddType(b.dataset.type)));
    $('#add-form').addEventListener('submit', saveOperation);
    $('#add-delete').addEventListener('click', deleteOperation);
    // formatage du montant avec séparateurs pendant la frappe
    $('#add-amount').addEventListener('input', (e) => {
      const n = parseAmount(e.target.value);
      e.target.value = n ? n.toLocaleString('fr-FR').replace(/ /g, ' ') : '';
    });

    $('#add-cat-btn').addEventListener('click', () => openCatModal(null));
    $('#cat-modal-save').addEventListener('click', saveCatModal);
    $$('[data-close-modal]').forEach((b) => b.addEventListener('click', closeCatModal));
  }

  /* ---------------- Démarrage ---------------- */
  async function init() {
    db = await openDB();
    let cats = await getAll('categories');
    if (!cats.length) {
      cats = DEFAULT_CATEGORIES.map((c, i) => ({ ...c, id: uid(), order: i }));
      for (const c of cats) await put('categories', c);
    }
    cats.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    state.categories = cats;
    state.operations = await getAll('operations');

    // période historique par défaut = mois
    $$('[data-period]').forEach((x) => x.classList.toggle('is-active', x.dataset.period === 'month'));

    wire();
    goto('home');

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  init().catch((err) => {
    console.error(err);
    document.body.innerHTML =
      '<p style="padding:40px;text-align:center;color:#d1495b">' +
      'Impossible de démarrer Nafa sur ce navigateur (IndexedDB indisponible).</p>';
  });
})();
