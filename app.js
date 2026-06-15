/* ============================================================
   Nafa — app de budget personnel (FCFA)
   Étape 1 : socle — opérations, catégories, tableau de bord
   Données 100% locales (IndexedDB). Rien n'est envoyé en ligne.
   ============================================================ */
(() => {
  'use strict';

  /* ---------------- IndexedDB (mini wrapper) ---------------- */
  const DB_NAME = 'nafa';
  const DB_VERSION = 3;
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
        if (!d.objectStoreNames.contains('budgets')) {
          d.createObjectStore('budgets', { keyPath: 'categoryId' });
        }
        if (!d.objectStoreNames.contains('recurrents')) {
          d.createObjectStore('recurrents', { keyPath: 'id' });
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
    budgets: [],
    recurrents: [],
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
  function budgetFor(catId) { return state.budgets.find((b) => b.categoryId === catId); }
  function recurrentById(id) { return state.recurrents.find((r) => r.id === id); }

  const pad2 = (n) => String(n).padStart(2, '0');
  function daysInMonth(mk) {
    const [y, m] = mk.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  }
  // Jour effectif d'une récurrence ce mois-ci (ex. 31 → 30 en juin)
  function effectiveDay(r, mk) { return Math.min(r.day, daysInMonth(mk)); }

  // Récurrences en attente de confirmation pour le mois en cours
  function pendingRecurrents() {
    const mk = currentMonthKey();
    const today = Number(todayISO().slice(8, 10));
    return state.recurrents.filter((r) =>
      r.active !== false &&
      !(r.posted || []).includes(mk) &&
      today >= effectiveDay(r, mk)
    );
  }

  // Dépensé par catégorie pour le mois en cours
  function spentMap() {
    const mk = currentMonthKey();
    const m = {};
    state.operations
      .filter((o) => o.type === 'expense' && monthKey(o.date) === mk)
      .forEach((o) => { m[o.categoryId] = (m[o.categoryId] || 0) + o.amount; });
    return m;
  }

  // Statut d'un budget : pourcentage, couleur (ok / proche / dépassé), reste
  function budgetStatus(spent, limit) {
    const ratio = limit > 0 ? spent / limit : 0;
    const pct = Math.min(100, Math.round(ratio * 100));
    let level = 'ok';
    if (ratio >= 1) level = 'over';
    else if (ratio >= 0.8) level = 'warn';
    return { pct, level, ratio, remaining: limit - spent, over: spent - limit };
  }

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
    if (screen === 'budgets') renderBudgets();
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

    renderHomePending();
    renderHomeBudgets();

    const recent = [...state.operations]
      .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))
      .slice(0, 5);
    renderOpList($('#home-recent'), recent, false);
  }

  // Carte "À confirmer ce mois" : récurrences dont le jour est arrivé
  function renderHomePending() {
    const wrap = $('#home-pending');
    const list = $('#home-pending-list');
    const pend = pendingRecurrents();
    if (!pend.length) { wrap.hidden = true; return; }
    wrap.hidden = false;
    list.innerHTML = '';
    pend.forEach((r) => {
      const c = catById(r.categoryId);
      const div = document.createElement('div');
      div.className = 'pending';
      div.innerHTML = `
        <div class="pending__top">
          <span class="pending__cat"><span class="bgt__emoji" style="background:${(c?.color || '#999')}1f">${c?.icon || '🔁'}</span>${escapeHtml(r.label)}</span>
          <span class="pending__type pending__type--${r.type}">${r.type === 'income' ? 'Revenu' : 'Dépense'}</span>
        </div>
        <div class="pending__action">
          <label class="pending__amount">
            <input inputmode="numeric" pattern="[0-9 ]*" value="${r.amount.toLocaleString('fr-FR')}" data-recur-amount="${r.id}" />
            <span>FCFA</span>
          </label>
          <button class="btn btn--primary pending__confirm" data-recur-confirm="${r.id}">Confirmer</button>
        </div>
        <button class="pending__skip" data-recur-skip="${r.id}">Ignorer ce mois</button>`;
      list.appendChild(div);
    });
  }

  async function confirmRecurrent(id) {
    const r = recurrentById(id);
    if (!r) return;
    const mk = currentMonthKey();
    const input = document.querySelector(`[data-recur-amount="${id}"]`);
    const amount = input ? parseAmount(input.value) : r.amount;
    if (amount <= 0) return toast('Montant invalide');
    const day = effectiveDay(r, mk);
    const op = {
      id: uid(),
      amount,
      categoryId: r.categoryId,
      type: r.type,
      date: `${mk}-${pad2(day)}`,
      note: r.label,
      createdAt: new Date().toISOString(),
    };
    await put('operations', op);
    state.operations.push(op);
    r.posted = [...(r.posted || []), mk];
    await put('recurrents', r);
    toast(r.type === 'income' ? 'Revenu ajouté ✓' : 'Charge ajoutée ✓');
    renderHome();
  }

  async function skipRecurrent(id) {
    const r = recurrentById(id);
    if (!r) return;
    r.posted = [...(r.posted || []), currentMonthKey()];
    await put('recurrents', r);
    toast('Ignoré ce mois');
    renderHome();
  }

  // Aperçu des budgets sur l'accueil (les plus "chauds" d'abord) + alertes
  function renderHomeBudgets() {
    const wrap = $('#home-budgets');
    const list = $('#home-budgets-list');
    const alertBox = $('#home-budget-alert');
    if (!state.budgets.length) { wrap.hidden = true; return; }
    wrap.hidden = false;
    const spent = spentMap();

    const rows = state.budgets
      .map((b) => ({ cat: catById(b.categoryId), limit: b.limit, spent: spent[b.categoryId] || 0 }))
      .filter((r) => r.cat)
      .map((r) => ({ ...r, st: budgetStatus(r.spent, r.limit) }))
      .sort((a, b) => b.st.ratio - a.st.ratio);

    // alertes : budgets à 80%+ ce mois
    const hot = rows.filter((r) => r.st.level !== 'ok');
    if (hot.length) {
      const over = hot.filter((r) => r.st.level === 'over').length;
      alertBox.hidden = false;
      alertBox.textContent = over
        ? `⚠️ ${over} budget${over > 1 ? 's' : ''} dépassé${over > 1 ? 's' : ''} ce mois`
        : `⚠️ ${hot.length} budget${hot.length > 1 ? 's' : ''} bientôt atteint${hot.length > 1 ? 's' : ''}`;
    } else {
      alertBox.hidden = true;
    }

    list.innerHTML = '';
    rows.slice(0, 4).forEach((r) => list.appendChild(budgetBar(r, true)));
  }

  // Construit une ligne "barre de budget" (compacte pour l'accueil, complète pour l'écran Budgets)
  function budgetBar(r, compact) {
    const li = document.createElement(compact ? 'div' : 'li');
    li.className = 'bgt' + (compact ? ' bgt--compact' : '');
    const right = r.st.level === 'over'
      ? `<span class="bgt__over">Dépassé de ${fmt(r.st.over)}</span>`
      : `<span class="bgt__rest">Reste ${fmt(Math.max(0, r.st.remaining))}</span>`;
    li.innerHTML = `
      <div class="bgt__head">
        <span class="bgt__cat"><span class="bgt__emoji" style="background:${r.cat.color}1f">${r.cat.icon}</span>${escapeHtml(r.cat.name)}</span>
        <span class="bgt__nums">${fmt(r.spent)} <span class="bgt__lim">/ ${fmt(r.limit)}</span></span>
      </div>
      <div class="bar"><div class="bar__fill bar__fill--${r.st.level}" style="width:${r.st.pct}%"></div></div>
      <div class="bgt__foot">${right}</div>`;
    if (!compact) {
      li.classList.add('tappable');
      li.addEventListener('click', () => openBudgetModal(r.cat));
    }
    return li;
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

  /* ---------------- Écran Budgets ---------------- */
  function renderBudgets() {
    const spent = spentMap();
    const expCats = state.categories.filter((c) => c.type === 'expense');
    const budgeted = expCats
      .filter((c) => budgetFor(c.id))
      .map((c) => ({ cat: c, limit: budgetFor(c.id).limit, spent: spent[c.id] || 0 }))
      .map((r) => ({ ...r, st: budgetStatus(r.spent, r.limit) }))
      .sort((a, b) => b.st.ratio - a.st.ratio);
    const unbudgeted = expCats.filter((c) => !budgetFor(c.id));

    // Résumé
    const totalLimit = budgeted.reduce((s, r) => s + r.limit, 0);
    const totalSpent = budgeted.reduce((s, r) => s + r.spent, 0);
    const summary = $('#budget-summary');
    if (budgeted.length) {
      const st = budgetStatus(totalSpent, totalLimit);
      summary.hidden = false;
      summary.innerHTML = `
        <span class="budget-summary__label">Dépensé ce mois sur budgets fixés</span>
        <span class="budget-summary__amount">${fmt(totalSpent)} <span class="budget-summary__lim">/ ${fmt(totalLimit)}</span></span>
        <div class="bar bar--light"><div class="bar__fill bar__fill--${st.level}" style="width:${st.pct}%"></div></div>`;
    } else {
      summary.hidden = true;
    }

    // Liste
    const list = $('#budget-list');
    list.innerHTML = '';

    if (budgeted.length) {
      const h = document.createElement('li');
      h.className = 'budget-sub';
      h.textContent = 'Budgets fixés';
      list.appendChild(h);
      budgeted.forEach((r) => list.appendChild(budgetBar(r, false)));
    }

    const h2 = document.createElement('li');
    h2.className = 'budget-sub';
    h2.textContent = budgeted.length ? 'Ajouter un budget' : 'Choisis une catégorie à plafonner';
    list.appendChild(h2);

    if (!unbudgeted.length) {
      const e = document.createElement('li');
      e.className = 'hint';
      e.style.margin = '0 2px';
      e.textContent = 'Toutes tes catégories de dépense ont déjà un budget 👍';
      list.appendChild(e);
    }
    unbudgeted.forEach((c) => {
      const li = document.createElement('li');
      li.className = 'budget-add-row tappable';
      li.innerHTML = `
        <span class="bgt__emoji" style="background:${c.color}1f">${c.icon}</span>
        <span class="budget-add-row__name">${escapeHtml(c.name)}</span>
        <span class="budget-add-row__cta">Définir +</span>`;
      li.addEventListener('click', () => openBudgetModal(c));
      list.appendChild(li);
    });
  }

  function openBudgetModal(cat) {
    const b = budgetFor(cat.id);
    $('#budget-modal-cat').value = cat.id;
    $('#budget-modal-title').textContent = `Budget — ${cat.name}`;
    $('#budget-modal-amount').value = b ? b.limit.toLocaleString('fr-FR').replace(/ /g, ' ') : '';
    $('#budget-modal-remove').hidden = !b;
    $('#budget-modal').hidden = false;
    setTimeout(() => $('#budget-modal-amount').focus(), 50);
  }
  function closeBudgetModal() { $('#budget-modal').hidden = true; }

  async function saveBudget() {
    const catId = $('#budget-modal-cat').value;
    const limit = parseAmount($('#budget-modal-amount').value);
    if (limit <= 0) return toast('Entre une limite');
    const bgt = { categoryId: catId, limit };
    await put('budgets', bgt);
    const existing = budgetFor(catId);
    if (existing) existing.limit = limit;
    else state.budgets.push(bgt);
    closeBudgetModal();
    renderBudgets();
    toast('Budget enregistré ✓');
  }

  async function removeBudget() {
    const catId = $('#budget-modal-cat').value;
    await del('budgets', catId);
    state.budgets = state.budgets.filter((b) => b.categoryId !== catId);
    closeBudgetModal();
    renderBudgets();
    toast('Budget retiré');
  }

  /* ---------------- Réglages : récurrences ---------------- */
  function renderRecurrents() {
    const ul = $('#recur-list');
    ul.innerHTML = '';
    if (!state.recurrents.length) {
      ul.innerHTML = '<li class="hint" style="margin:0 2px">Aucune récurrence. Ajoute ton loyer, ton salaire, tes abonnements…</li>';
      return;
    }
    [...state.recurrents]
      .sort((a, b) => a.day - b.day)
      .forEach((r) => {
        const c = catById(r.categoryId);
        const li = document.createElement('li');
        li.className = 'recur-row';
        li.innerHTML = `
          <span class="bgt__emoji" style="background:${(c?.color || '#999')}1f">${c?.icon || '🔁'}</span>
          <span class="recur-row__main">
            <span class="recur-row__label">${escapeHtml(r.label)}</span>
            <span class="recur-row__meta">${r.type === 'income' ? '＋' : '－'} ${fmt(r.amount)} · le ${r.day} du mois</span>
          </span>
          <button class="cat-row__btn edit" title="Modifier">✏️</button>
          <button class="cat-row__btn del" title="Supprimer">🗑️</button>`;
        li.querySelector('.edit').addEventListener('click', () => openRecurModal(r));
        li.querySelector('.del').addEventListener('click', () => removeRecurrent(r));
        ul.appendChild(li);
      });
  }

  function fillRecurCatSelect(type, selectedId) {
    const sel = $('#recur-modal-cat');
    sel.innerHTML = state.categories
      .filter((c) => c.type === type)
      .map((c) => `<option value="${c.id}">${c.icon} ${escapeHtml(c.name)}</option>`)
      .join('');
    if (selectedId) sel.value = selectedId;
  }

  function openRecurModal(r) {
    $('#recur-modal-id').value = r ? r.id : '';
    $('#recur-modal-title').textContent = r ? 'Modifier la récurrence' : 'Nouvelle récurrence';
    $('#recur-modal-label').value = r ? r.label : '';
    $('#recur-modal-amount').value = r ? r.amount.toLocaleString('fr-FR') : '';
    $('#recur-modal-day').value = r ? r.day : 1;
    const type = r ? r.type : 'expense';
    $('#recur-modal-type').value = type;
    fillRecurCatSelect(type, r ? r.categoryId : null);
    $('#recur-modal-remove').hidden = !r;
    $('#recur-modal').hidden = false;
  }
  function closeRecurModal() { $('#recur-modal').hidden = true; }

  async function saveRecur() {
    const label = $('#recur-modal-label').value.trim();
    const amount = parseAmount($('#recur-modal-amount').value);
    let day = parseInt($('#recur-modal-day').value, 10);
    if (!label) return toast('Donne un libellé');
    if (amount <= 0) return toast('Entre un montant');
    if (isNaN(day) || day < 1) day = 1;
    if (day > 31) day = 31;
    const id = $('#recur-modal-id').value || uid();
    const existing = recurrentById(id);
    const rec = {
      id,
      label,
      amount,
      day,
      type: $('#recur-modal-type').value,
      categoryId: $('#recur-modal-cat').value,
      active: true,
      posted: existing ? (existing.posted || []) : [],
    };
    await put('recurrents', rec);
    if (existing) Object.assign(existing, rec);
    else state.recurrents.push(rec);
    closeRecurModal();
    renderRecurrents();
    toast('Récurrence enregistrée ✓');
  }

  async function removeRecurrent(r) {
    if (!confirm(`Supprimer la récurrence « ${r.label} » ?`)) return;
    await del('recurrents', r.id);
    state.recurrents = state.recurrents.filter((x) => x.id !== r.id);
    renderRecurrents();
    toast('Récurrence supprimée');
  }

  /* ---------------- Réglages : catégories ---------------- */
  function renderSettings() {
    renderRecurrents();
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

    // budgets
    $('#budget-modal-save').addEventListener('click', saveBudget);
    $('#budget-modal-remove').addEventListener('click', removeBudget);
    $$('[data-close-budget]').forEach((b) => b.addEventListener('click', closeBudgetModal));
    $('#budget-modal-amount').addEventListener('input', (e) => {
      const n = parseAmount(e.target.value);
      e.target.value = n ? n.toLocaleString('fr-FR').replace(/ /g, ' ') : '';
    });

    // récurrences
    $('#add-recur-btn').addEventListener('click', () => openRecurModal(null));
    $('#recur-modal-save').addEventListener('click', saveRecur);
    $('#recur-modal-remove').addEventListener('click', () => {
      const r = recurrentById($('#recur-modal-id').value);
      if (r) { closeRecurModal(); removeRecurrent(r); }
    });
    $$('[data-close-recur]').forEach((b) => b.addEventListener('click', closeRecurModal));
    $('#recur-modal-type').addEventListener('change', (e) => fillRecurCatSelect(e.target.value));
    $('#recur-modal-amount').addEventListener('input', (e) => {
      const n = parseAmount(e.target.value);
      e.target.value = n ? n.toLocaleString('fr-FR').replace(/ /g, ' ') : '';
    });

    // carte "à confirmer" (délégation)
    $('#home-pending-list').addEventListener('click', (e) => {
      const c = e.target.closest('[data-recur-confirm]');
      const s = e.target.closest('[data-recur-skip]');
      if (c) confirmRecurrent(c.dataset.recurConfirm);
      else if (s) skipRecurrent(s.dataset.recurSkip);
    });
    $('#home-pending-list').addEventListener('input', (e) => {
      if (e.target.matches('[data-recur-amount]')) {
        const n = parseAmount(e.target.value);
        e.target.value = n ? n.toLocaleString('fr-FR').replace(/ /g, ' ') : '';
      }
    });
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
    state.budgets = await getAll('budgets');
    state.recurrents = await getAll('recurrents');

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
