/* ============================================================
   Nafa — app de budget personnel (FCFA)
   Étape 1 : socle — opérations, catégories, tableau de bord
   Données 100% locales (IndexedDB). Rien n'est envoyé en ligne.
   ============================================================ */
(() => {
  'use strict';

  /* ---------------- IndexedDB (mini wrapper) ---------------- */
  const DB_NAME = 'nafa';
  const DB_VERSION = 5;
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
        if (!d.objectStoreNames.contains('groups')) {
          d.createObjectStore('groups', { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains('accounts')) {
          d.createObjectStore('accounts', { keyPath: 'id' });
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
  function clearStore(store) {
    return new Promise((res, rej) => {
      const r = tx(store, 'readwrite').clear();
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

  /* ---------------- Comptes (Mobile Money / espèces) ---------------- */
  const DEFAULT_ACCOUNTS = [
    { id: 'a-cash', name: 'Espèces',      icon: '💵', color: '#10b981', opening: 0, order: 0 },
    { id: 'a-wave', name: 'Wave',         icon: '🌊', color: '#1dc4e9', opening: 0, order: 1 },
    { id: 'a-om',   name: 'Orange Money', icon: '🟠', color: '#f97316', opening: 0, order: 2 },
    { id: 'a-bank', name: 'Banque',       icon: '🏦', color: '#3b82f6', opening: 0, order: 3 },
  ];

  /* ---------------- État ---------------- */
  const state = {
    categories: [],
    operations: [],
    budgets: [],
    recurrents: [],
    accounts: [],
    addType: 'expense',
    addCatId: null,
    addAccountId: null,
    histPeriod: 'month',
    histCat: 'all',
    histView: 'list',
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
  function accountById(id) { return state.accounts.find((a) => a.id === id); }

  // Solde courant d'un compte = solde de départ + revenus − dépenses + transferts
  function accountBalance(id) {
    const acc = accountById(id);
    let bal = acc ? (acc.opening || 0) : 0;
    state.operations.forEach((o) => {
      if (o.type === 'transfer') {
        if (o.accountId === id) bal -= o.amount;       // compte source
        if (o.toAccountId === id) bal += o.amount;      // compte destination
        return;
      }
      if (o.accountId !== id) return;
      bal += o.type === 'income' ? o.amount : -o.amount;
    });
    return bal;
  }

  const pad2 = (n) => String(n).padStart(2, '0');
  function daysInMonth(mk) {
    const [y, m] = mk.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  }
  function prevMonthKey(mk) {
    const [y, m] = mk.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  }
  // Dépenses d'un mois jusqu'au jour `day` inclus (pour comparer "à date")
  function expensesUpToDay(mk, day) {
    return state.operations
      .filter((o) => o.type === 'expense' && monthKey(o.date) === mk && Number(o.date.slice(8, 10)) <= day)
      .reduce((s, o) => s + o.amount, 0);
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
    if (screen === 'history') renderHistoryScreen();
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

    renderHomeAccounts();
    renderInsight();
    renderHomePending();
    renderHomeBudgets();

    const recent = [...state.operations]
      .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))
      .slice(0, 5);
    renderOpList($('#home-recent'), recent, false);
  }

  // "Mes comptes" : solde de chaque compte (espèces, Wave, Orange Money, banque)
  function renderHomeAccounts() {
    const wrap = $('#home-accounts');
    const row = $('#home-accounts-row');
    if (!state.accounts.length) { wrap.hidden = true; return; }
    wrap.hidden = false;
    const total = state.accounts.reduce((s, a) => s + accountBalance(a.id), 0);
    $('#home-accounts-total').textContent = fmt(total);
    row.innerHTML = '';
    state.accounts.forEach((a) => {
      const card = document.createElement('div');
      card.className = 'acc-card';
      card.innerHTML = `
        <span class="acc-card__icon" style="background:${a.color}1f">${a.icon}</span>
        <span class="acc-card__name">${escapeHtml(a.name)}</span>
        <span class="acc-card__bal">${fmt(accountBalance(a.id))}</span>`;
      row.appendChild(card);
    });
  }

  // Comparaison avec le mois dernier (à date) — ligne d'insight sur l'accueil
  function renderInsight() {
    const wrap = $('#home-insight');
    const d = Number(todayISO().slice(8, 10));
    const mk = currentMonthKey();
    const cur = expensesUpToDay(mk, d);
    const prev = expensesUpToDay(prevMonthKey(mk), d);
    if (cur === 0 && prev === 0) { wrap.hidden = true; return; }
    wrap.hidden = false;
    if (prev === 0) {
      wrap.className = 'home-insight insight--neutral';
      wrap.innerHTML = '📊 Premier mois de suivi — continue&nbsp;!';
      return;
    }
    const pct = Math.round(((cur - prev) / prev) * 100);
    if (Math.abs(pct) < 3) {
      wrap.className = 'home-insight insight--neutral';
      wrap.innerHTML = '➖ Tu dépenses comme le mois dernier, à la même date.';
    } else if (pct < 0) {
      wrap.className = 'home-insight insight--good';
      wrap.innerHTML = `📉 <strong>${Math.abs(pct)}% de dépenses en moins</strong> qu'au mois dernier à la même date. 👏`;
    } else {
      wrap.className = 'home-insight insight--bad';
      wrap.innerHTML = `📈 <strong>${pct}% de dépenses en plus</strong> qu'au mois dernier à la même date.`;
    }
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

  // Crée l'opération d'une récurrence pour le mois en cours et la marque "payée/confirmée"
  async function postRecurrent(r, amount, dateISO) {
    const mk = currentMonthKey();
    const op = {
      id: uid(),
      amount,
      categoryId: r.categoryId,
      accountId: r.accountId || (state.accounts[0] && state.accounts[0].id),
      type: r.type,
      date: dateISO,
      note: r.label,
      createdAt: new Date().toISOString(),
    };
    await put('operations', op);
    state.operations.push(op);
    r.posted = [...(r.posted || []), mk];
    r.payments = { ...(r.payments || {}), [mk]: op.id };
    await put('recurrents', r);
    return op;
  }

  // Annule le paiement/confirmation du mois (supprime l'opération créée)
  async function unpostRecurrent(r) {
    const mk = currentMonthKey();
    const opId = (r.payments || {})[mk];
    if (opId) {
      await del('operations', opId);
      state.operations = state.operations.filter((o) => o.id !== opId);
    }
    r.posted = (r.posted || []).filter((m) => m !== mk);
    if (r.payments) delete r.payments[mk];
    await put('recurrents', r);
  }

  async function confirmRecurrent(id) {
    const r = recurrentById(id);
    if (!r) return;
    const mk = currentMonthKey();
    const input = document.querySelector(`[data-recur-amount="${id}"]`);
    const amount = input ? parseAmount(input.value) : r.amount;
    if (amount <= 0) return toast('Montant invalide');
    await postRecurrent(r, amount, `${mk}-${pad2(effectiveDay(r, mk))}`);
    toast(r.type === 'income' ? 'Revenu ajouté ✓' : 'Charge ajoutée ✓');
    renderHome();
  }

  // Payer une facture/abonnement depuis l'écran Budgets (montant ajustable, daté du jour)
  async function payBill(id) {
    const r = recurrentById(id);
    if (!r) return;
    const input = document.querySelector(`[data-bill-amount="${id}"]`);
    const amount = input ? parseAmount(input.value) : r.amount;
    if (amount <= 0) return toast('Montant invalide');
    await postRecurrent(r, amount, todayISO());
    toast('Payé ✓ — déduit du solde');
    renderBudgets();
  }

  async function unpayBill(id) {
    const r = recurrentById(id);
    if (!r) return;
    await unpostRecurrent(r);
    toast('Paiement annulé');
    renderBudgets();
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
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'op';
    if (o.type === 'transfer') {
      const from = accountById(o.accountId), to = accountById(o.toAccountId);
      btn.innerHTML = `
        <span class="op__icon" style="background:var(--surface-2)">🔄</span>
        <span class="op__main">
          <span class="op__cat">Transfert</span>
          <span class="op__note">${escapeHtml((from?.name || '?') + ' → ' + (to?.name || '?'))}${o.note ? ' · ' + escapeHtml(o.note) : ''}</span>
        </span>
        <span class="op__amount op__amount--neutral">⇄ ${fmt(o.amount)}</span>`;
    } else {
      const c = catById(o.categoryId);
      const acc = accountById(o.accountId);
      btn.innerHTML = `
        <span class="op__icon" style="background:${(c?.color || '#999')}1f">${c?.icon || '❓'}</span>
        <span class="op__main">
          <span class="op__cat">${escapeHtml(c?.name || 'Sans catégorie')}</span>
          <span class="op__note">${acc ? acc.icon + ' ' : ''}${escapeHtml(o.note || (acc ? acc.name : ''))}</span>
        </span>
        <span class="op__amount ${o.type === 'income' ? 'is-in' : 'is-out'}">
          ${o.type === 'income' ? '+' : '–'} ${fmt(o.amount)}
        </span>`;
    }
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
    const isTransfer = type === 'transfer';
    $('#add-cat-block').hidden = isTransfer;
    $('#add-acc-block').hidden = isTransfer;
    $('#add-transfer-block').hidden = !isTransfer;
    if (isTransfer) {
      fillAccountSelect($('#add-from-acc'), state.accounts[0] && state.accounts[0].id);
      fillAccountSelect($('#add-to-acc'), state.accounts[1] && state.accounts[1].id);
    } else {
      // garder la catégorie si compatible, sinon réinitialiser
      const c = catById(state.addCatId);
      if (!c || c.type !== type) state.addCatId = null;
      renderCatGrid();
    }
  }

  // Pastilles de choix du compte (Espèces / Wave / Orange Money / Banque)
  function renderAccPills() {
    const row = $('#add-acc-row');
    if (!row) return;
    row.innerHTML = '';
    state.accounts.forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'acc-pill' + (a.id === state.addAccountId ? ' is-active' : '');
      b.innerHTML = `<span>${a.icon}</span>${escapeHtml(a.name)}`;
      b.addEventListener('click', () => { state.addAccountId = a.id; renderAccPills(); });
      row.appendChild(b);
    });
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
    if (!accountById(state.addAccountId)) state.addAccountId = state.accounts[0] ? state.accounts[0].id : null;
    renderAccPills();
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
    if (o.type === 'transfer') {
      setAddType('transfer');
      $('#add-from-acc').value = o.accountId;
      $('#add-to-acc').value = o.toAccountId;
    } else {
      state.addCatId = o.categoryId;
      state.addAccountId = o.accountId || (state.accounts[0] && state.accounts[0].id);
      renderAccPills();
      setAddType(o.type);
    }
  }

  async function saveOperation(e) {
    e.preventDefault();
    const amount = parseAmount($('#add-amount').value);
    if (amount <= 0) return toast('Entre un montant');
    const id = $('#add-id').value || uid();
    const existing = state.operations.find((x) => x.id === id);
    let op;
    if (state.addType === 'transfer') {
      const from = $('#add-from-acc').value, to = $('#add-to-acc').value;
      if (from === to) return toast('Choisis deux comptes différents');
      op = {
        id, amount, type: 'transfer',
        categoryId: null,
        accountId: from,
        toAccountId: to,
        date: $('#add-date').value || todayISO(),
        note: $('#add-note').value.trim(),
        createdAt: existing ? existing.createdAt : new Date().toISOString(),
      };
      await put('operations', op);
      if (existing) Object.assign(existing, op); else state.operations.push(op);
      toast('Transfert enregistré ✓');
      resetAddForm();
      return goto('home');
    }
    if (!state.addCatId) return toast('Choisis une catégorie');
    op = {
      id,
      amount,
      categoryId: state.addCatId,
      accountId: state.addAccountId || (state.accounts[0] && state.accounts[0].id),
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

  function renderHistoryScreen() {
    const isReport = state.histView === 'report';
    $('#history-list-view').hidden = isReport;
    $('#history-report-view').hidden = !isReport;
    $('#cat-filter').style.display = isReport ? 'none' : '';
    $$('[data-view]').forEach((b) => b.classList.toggle('is-active', b.dataset.view === state.histView));
    if (isReport) renderReports(); else renderHistory();
  }

  /* ---------------- Rapports ---------------- */
  const periodWord = { day: 'aujourd’hui', week: 'cette semaine', month: 'ce mois', all: 'au total' };
  const fmtNum = (n) => Math.round(n).toLocaleString('fr-FR');
  const compact = (n) => (n >= 1000 ? Math.round(n / 1000) + 'k' : String(Math.round(n)));

  function renderReports() {
    const ops = periodFilter(state.operations);
    const exp = ops.filter((o) => o.type === 'expense');
    const totalExp = exp.reduce((s, o) => s + o.amount, 0);
    const totalRev = ops.filter((o) => o.type === 'income').reduce((s, o) => s + o.amount, 0);

    // Bilan de la période
    $('#report-bilan').innerHTML = `
      <div class="rbilan__cell"><span>Revenus</span><strong class="is-in">${fmt(totalRev)}</strong></div>
      <div class="rbilan__cell"><span>Dépenses</span><strong class="is-out">${fmt(totalExp)}</strong></div>
      <div class="rbilan__cell"><span>Solde ${periodWord[state.histPeriod]}</span><strong>${fmt(totalRev - totalExp)}</strong></div>`;

    // Comparaison avec le mois dernier (à date) — seulement en vue "mois"
    const cmp = $('#report-compare');
    if (state.histPeriod === 'month') {
      const d = Number(todayISO().slice(8, 10));
      const mk = currentMonthKey();
      const pmk = prevMonthKey(mk);
      const cur = expensesUpToDay(mk, d);
      const prev = expensesUpToDay(pmk, d);
      // top hausses par catégorie
      const curByCat = {}, prevByCat = {};
      state.operations.forEach((o) => {
        if (o.type !== 'expense') return;
        const day = Number(o.date.slice(8, 10));
        if (monthKey(o.date) === mk && day <= d) curByCat[o.categoryId] = (curByCat[o.categoryId] || 0) + o.amount;
        if (monthKey(o.date) === pmk && day <= d) prevByCat[o.categoryId] = (prevByCat[o.categoryId] || 0) + o.amount;
      });
      const movers = [...new Set([...Object.keys(curByCat), ...Object.keys(prevByCat)])]
        .map((id) => ({ cat: catById(id), delta: (curByCat[id] || 0) - (prevByCat[id] || 0) }))
        .filter((m) => m.cat && m.delta > 0)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 3);
      if (cur === 0 && prev === 0) {
        cmp.hidden = true;
      } else {
        cmp.hidden = false;
        const pct = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
        const head = pct === null
          ? `Premier mois de suivi : <strong>${fmt(cur)}</strong> dépensés à ce jour.`
          : `À ce jour : <strong>${fmt(cur)}</strong> vs <strong>${fmt(prev)}</strong> le mois dernier <span class="cmp-tag ${pct > 0 ? 'cmp-tag--up' : 'cmp-tag--down'}">${pct > 0 ? '+' : ''}${pct}%</span>`;
        cmp.innerHTML = `
          <h3 class="report-card__title">Comparaison avec le mois dernier</h3>
          <p class="cmp-head">${head}</p>
          ${movers.length ? '<p class="cmp-sub">Plus que le mois dernier sur&nbsp;:</p><ul class="cmp-movers">' +
            movers.map((m) => `<li><span class="bgt__emoji" style="background:${m.cat.color}1f">${m.cat.icon}</span>${escapeHtml(m.cat.name)} <strong>+${fmt(m.delta)}</strong></li>`).join('') + '</ul>' : ''}`;
      }
    } else {
      cmp.hidden = true;
    }

    // Répartition par catégorie (camembert)
    const byCat = {};
    exp.forEach((o) => { byCat[o.categoryId] = (byCat[o.categoryId] || 0) + o.amount; });
    const slices = Object.entries(byCat)
      .map(([id, amt]) => ({ cat: catById(id), amt }))
      .filter((s) => s.cat)
      .sort((a, b) => b.amt - a.amt);

    const donut = $('#report-donut');
    if (!slices.length) {
      donut.innerHTML = `<p class="empty" style="border:none">Pas encore de dépenses ${periodWord[state.histPeriod]}.</p>`;
    } else {
      donut.innerHTML = donutSVG(slices, totalExp) +
        '<ul class="legend">' + slices.map((s) => {
          const pct = totalExp > 0 ? Math.round((s.amt / totalExp) * 100) : 0;
          return `<li class="legend__item">
            <span class="legend__dot" style="background:${s.cat.color}"></span>
            <span class="legend__name">${s.cat.icon} ${escapeHtml(s.cat.name)}</span>
            <span class="legend__val">${fmt(s.amt)} <span class="legend__pct">${pct}%</span></span>
          </li>`;
        }).join('') + '</ul>';
    }

    // Tendance des dépenses sur 6 mois
    renderTrend();
  }

  function donutSVG(slices, total) {
    const r = 54, cx = 70, cy = 70, sw = 24, C = 2 * Math.PI * r;
    let offset = 0;
    const segs = slices.map((s) => {
      const len = (total > 0 ? s.amt / total : 0) * C;
      const el = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.cat.color}" stroke-width="${sw}" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
      offset += len;
      return el;
    }).join('');
    return `<div class="donut-wrap"><svg viewBox="0 0 140 140" class="donut">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="${sw}"/>
      ${segs}
      <text x="${cx}" y="${cy - 2}" text-anchor="middle" class="donut__total">${fmtNum(total)}</text>
      <text x="${cx}" y="${cy + 15}" text-anchor="middle" class="donut__label">FCFA dépensés</text>
    </svg></div>`;
  }

  function renderTrend() {
    const [y, m] = currentMonthKey().split('-').map(Number);
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(y, m - 1 - i, 1);
      months.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
    }
    const totals = months.map((mk) =>
      state.operations
        .filter((o) => o.type === 'expense' && monthKey(o.date) === mk)
        .reduce((s, o) => s + o.amount, 0)
    );
    const max = Math.max(1, ...totals);
    const cur = currentMonthKey();
    const cols = months.map((mk, i) => {
      const h = Math.round((totals[i] / max) * 100);
      const label = MONTHS_FR[Number(mk.split('-')[1]) - 1].slice(0, 3).toLowerCase();
      return `<div class="trend__col">
        <span class="trend__v">${totals[i] ? compact(totals[i]) : ''}</span>
        <div class="trend__track"><div class="trend__bar ${mk === cur ? 'trend__bar--cur' : ''}" style="height:${h}%"></div></div>
        <span class="trend__m">${label}</span>
      </div>`;
    }).join('');
    $('#report-trend').innerHTML = `<div class="trend">${cols}</div>`;
  }

  /* ---------------- Écran Budgets ---------------- */
  function renderBudgets() {
    renderBills();

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

  /* ---------------- Budgets : factures & abonnements ---------------- */
  function renderBills() {
    const mk = currentMonthKey();
    const bills = state.recurrents
      .filter((r) => r.type === 'expense')
      .sort((a, b) => a.day - b.day);
    const summary = $('#bills-summary');
    const list = $('#bills-list');
    list.innerHTML = '';

    if (!bills.length) {
      summary.hidden = true;
      list.innerHTML = '<li class="hint" style="margin:0 2px">Aucune facture ni abonnement. Ajoute Internet, SENELEC/WOYOFAL, loyer, gardiennage…</li>';
      return;
    }

    const isPaid = (b) => (b.posted || []).includes(mk);
    const paidAmount = (b) => {
      const opId = (b.payments || {})[mk];
      const op = opId && state.operations.find((o) => o.id === opId);
      return op ? op.amount : b.amount;
    };
    const remaining = bills.filter((b) => !isPaid(b)).reduce((s, b) => s + b.amount, 0);
    const paid = bills.filter(isPaid).reduce((s, b) => s + paidAmount(b), 0);

    summary.hidden = false;
    summary.innerHTML = `
      <div class="bills-summary__row">
        <span>Reste à payer ce mois</span><strong>${fmt(remaining)}</strong>
      </div>
      <div class="bills-summary__sub">Déjà payé : ${fmt(paid)} · ${bills.filter(isPaid).length}/${bills.length} réglé${bills.length > 1 ? 's' : ''}</div>`;

    bills.forEach((b) => {
      const c = catById(b.categoryId);
      const li = document.createElement('li');
      li.className = 'bill' + (isPaid(b) ? ' bill--paid' : '');
      const head = `
        <div class="bill__top">
          <button class="bill__id" data-bill-edit="${b.id}">
            <span class="bgt__emoji" style="background:${(c?.color || '#999')}1f">${c?.icon || '🧾'}</span>
            <span class="bill__name">${escapeHtml(b.label)}</span>
          </button>
          ${isPaid(b) ? '<span class="bill__badge">✓ Payé</span>' : `<span class="bill__day">le ${b.day}</span>`}
        </div>`;
      const action = isPaid(b)
        ? `<div class="bill__paidrow"><span class="bill__paidamt">${fmt(paidAmount(b))}</span>
             <button class="bill__undo" data-bill-unpay="${b.id}">Annuler</button></div>`
        : `<div class="bill__action">
             <label class="pending__amount">
               <input inputmode="numeric" pattern="[0-9 ]*" value="${b.amount.toLocaleString('fr-FR')}" data-bill-amount="${b.id}" />
               <span>FCFA</span>
             </label>
             <button class="btn btn--primary bill__pay" data-bill-pay="${b.id}">Payer</button>
           </div>`;
      li.innerHTML = head + action;
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

  function fillAccountSelect(sel, selectedId) {
    sel.innerHTML = state.accounts
      .map((a) => `<option value="${a.id}">${a.icon} ${escapeHtml(a.name)}</option>`).join('');
    sel.value = selectedId || (state.accounts[0] && state.accounts[0].id) || '';
  }

  function openRecurModal(r, presetType) {
    $('#recur-modal-id').value = r ? r.id : '';
    $('#recur-modal-title').textContent = r ? 'Modifier' : 'Nouvelle entrée';
    $('#recur-modal-label').value = r ? r.label : '';
    $('#recur-modal-amount').value = r ? r.amount.toLocaleString('fr-FR') : '';
    $('#recur-modal-day').value = r ? r.day : 1;
    const type = r ? r.type : (presetType || 'expense');
    $('#recur-modal-type').value = type;
    fillRecurCatSelect(type, r ? r.categoryId : null);
    fillAccountSelect($('#recur-modal-acc'), r ? r.accountId : null);
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
      accountId: $('#recur-modal-acc').value,
      active: true,
      posted: existing ? (existing.posted || []) : [],
      payments: existing ? (existing.payments || {}) : {},
    };
    await put('recurrents', rec);
    if (existing) Object.assign(existing, rec);
    else state.recurrents.push(rec);
    closeRecurModal();
    renderRecurrents();
    renderBills();
    toast('Enregistré ✓');
  }

  async function removeRecurrent(r) {
    if (!confirm(`Supprimer « ${r.label} » ?`)) return;
    await del('recurrents', r.id);
    state.recurrents = state.recurrents.filter((x) => x.id !== r.id);
    renderRecurrents();
    renderBills();
    toast('Supprimé');
  }

  /* ---------------- Réglages : comptes ---------------- */
  function renderAccountsSettings() {
    const ul = $('#account-list');
    ul.innerHTML = '';
    state.accounts.forEach((a) => {
      const li = document.createElement('li');
      li.className = 'cat-row';
      li.innerHTML = `
        <span class="cat-row__emoji">${a.icon}</span>
        <span class="recur-row__main">
          <span class="recur-row__label">${escapeHtml(a.name)}</span>
          <span class="recur-row__meta">Solde : ${fmt(accountBalance(a.id))}</span>
        </span>
        <button class="cat-row__btn edit" title="Modifier">✏️</button>
        <button class="cat-row__btn del" title="Supprimer">🗑️</button>`;
      li.querySelector('.edit').addEventListener('click', () => openAccountModal(a));
      li.querySelector('.del').addEventListener('click', () => removeAccount(a));
      ul.appendChild(li);
    });
  }

  function openAccountModal(a) {
    $('#account-modal-id').value = a ? a.id : '';
    $('#account-modal-title').textContent = a ? 'Modifier le compte' : 'Nouveau compte';
    $('#account-modal-name').value = a ? a.name : '';
    $('#account-modal-icon').value = a ? a.icon : '';
    $('#account-modal-opening').value = a && a.opening ? a.opening.toLocaleString('fr-FR') : '';
    $('#account-modal-remove').hidden = !a;
    $('#account-modal').hidden = false;
  }
  function closeAccountModal() { $('#account-modal').hidden = true; }

  async function saveAccount() {
    const name = $('#account-modal-name').value.trim();
    if (!name) return toast('Donne un nom');
    const id = $('#account-modal-id').value || ('a-' + uid());
    const existing = accountById(id);
    const acc = {
      id,
      name,
      icon: $('#account-modal-icon').value.trim() || (existing ? existing.icon : '👛'),
      color: existing ? existing.color : PALETTE[state.accounts.length % PALETTE.length],
      opening: parseAmount($('#account-modal-opening').value),
      order: existing ? existing.order : (Math.max(0, ...state.accounts.map((x) => x.order ?? 0)) + 1),
    };
    await put('accounts', acc);
    if (existing) Object.assign(existing, acc);
    else state.accounts.push(acc);
    closeAccountModal();
    renderSettings();
    toast('Compte enregistré ✓');
  }

  async function removeAccount(a) {
    if (state.accounts.length <= 1) return alert('Garde au moins un compte.');
    const used = state.operations.some((o) => o.accountId === a.id);
    if (used) return alert('Ce compte est utilisé par des opérations. Réaffecte-les d’abord.');
    if (!confirm(`Supprimer le compte « ${a.name} » ?`)) return;
    await del('accounts', a.id);
    state.accounts = state.accounts.filter((x) => x.id !== a.id);
    renderSettings();
    toast('Compte supprimé');
  }

  /* ---------------- Réglages : catégories ---------------- */
  function renderSettings() {
    renderAccountsSettings();
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

  function openCatModal(cat, presetType) {
    $('#cat-modal-id').value = cat ? cat.id : '';
    $('#cat-modal-name').value = cat ? cat.name : '';
    $('#cat-modal-icon').value = cat ? cat.icon : '';
    $('#cat-modal-type').value = cat ? cat.type : (presetType || 'expense');
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
      renderHistoryScreen();
    }));
    $('#cat-filter').addEventListener('change', (e) => { state.histCat = e.target.value; renderHistory(); });
    $$('[data-view]').forEach((b) => b.addEventListener('click', () => {
      state.histView = b.dataset.view;
      renderHistoryScreen();
    }));

    $$('.type-toggle__btn').forEach((b) => b.addEventListener('click', () => setAddType(b.dataset.type)));
    $('#add-form').addEventListener('submit', saveOperation);
    $('#add-delete').addEventListener('click', deleteOperation);
    // formatage du montant avec séparateurs pendant la frappe
    $('#add-amount').addEventListener('input', (e) => {
      const n = parseAmount(e.target.value);
      e.target.value = n ? n.toLocaleString('fr-FR').replace(/ /g, ' ') : '';
    });

    $('#add-cat-btn-expense').addEventListener('click', () => openCatModal(null, 'expense'));
    $('#add-cat-btn-income').addEventListener('click', () => openCatModal(null, 'income'));
    $('#cat-modal-save').addEventListener('click', saveCatModal);
    $$('[data-close-modal]').forEach((b) => b.addEventListener('click', closeCatModal));

    // comptes
    $('#add-account-btn').addEventListener('click', () => openAccountModal(null));
    $('#account-modal-save').addEventListener('click', saveAccount);
    $('#account-modal-remove').addEventListener('click', () => {
      const a = accountById($('#account-modal-id').value);
      if (a) { closeAccountModal(); removeAccount(a); }
    });
    $$('[data-close-account]').forEach((b) => b.addEventListener('click', closeAccountModal));
    $('#account-modal-opening').addEventListener('input', (e) => {
      const n = parseAmount(e.target.value);
      e.target.value = n ? n.toLocaleString('fr-FR').replace(/ /g, ' ') : '';
    });

    // sauvegarde + installation
    $('#export-btn').addEventListener('click', exportData);
    $('#import-btn').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', (e) => {
      if (e.target.files[0]) importData(e.target.files[0]);
      e.target.value = '';
    });
    $('#install-btn').addEventListener('click', installApp);

    // thème clair / sombre
    $$('[data-theme-set]').forEach((b) => b.addEventListener('click', () => applyTheme(b.dataset.themeSet)));

    // code PIN
    $('#pin-toggle-btn').addEventListener('click', togglePin);
    $('#pin-modal-save').addEventListener('click', savePin);
    $$('[data-close-pin]').forEach((b) => b.addEventListener('click', closePinModal));
    $('#lock-keypad').addEventListener('click', (e) => {
      const b = e.target.closest('[data-pin]');
      if (b) pinPress(b.dataset.pin);
    });

    // factures & abonnements (écran Budgets)
    $('#add-bill-btn').addEventListener('click', () => openRecurModal(null, 'expense'));
    $('#bills-list').addEventListener('click', (e) => {
      const pay = e.target.closest('[data-bill-pay]');
      const unpay = e.target.closest('[data-bill-unpay]');
      const edit = e.target.closest('[data-bill-edit]');
      if (pay) payBill(pay.dataset.billPay);
      else if (unpay) unpayBill(unpay.dataset.billUnpay);
      else if (edit) openRecurModal(recurrentById(edit.dataset.billEdit), 'expense');
    });
    $('#bills-list').addEventListener('input', (e) => {
      if (e.target.matches('[data-bill-amount]')) {
        const n = parseAmount(e.target.value);
        e.target.value = n ? n.toLocaleString('fr-FR').replace(/ /g, ' ') : '';
      }
    });

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

  /* ---------------- Sauvegarde : export / import ---------------- */
  const BACKUP_STORES = ['categories', 'operations', 'budgets', 'recurrents', 'accounts'];

  async function exportData() {
    const data = { app: 'nafa', version: 1, exportedAt: new Date().toISOString() };
    for (const s of BACKUP_STORES) data[s] = await getAll(s);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nafa-sauvegarde-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Sauvegarde exportée ✓');
  }

  async function importData(file) {
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      return alert('Fichier illisible — ce n’est pas une sauvegarde valide.');
    }
    if (!data || data.app !== 'nafa' || !Array.isArray(data.categories)) {
      return alert('Ce fichier n’est pas une sauvegarde Nafa.');
    }
    const opsN = (data.operations || []).length;
    if (!confirm(`Importer cette sauvegarde (${data.categories.length} catégories, ${opsN} opérations) ?\n\n⚠️ Cela remplacera toutes tes données actuelles.`)) return;
    for (const s of BACKUP_STORES) {
      await clearStore(s);
      for (const item of (data[s] || [])) await put(s, item);
    }
    toast('Sauvegarde importée ✓');
    setTimeout(() => location.reload(), 700);
  }

  /* ---------------- Installation (PWA) ---------------- */
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const row = $('#install-row');
    if (row) row.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    const row = $('#install-row');
    if (row) row.hidden = true;
    toast('Nafa installée ✓');
  });
  async function installApp() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    const row = $('#install-row');
    if (row) row.hidden = true;
  }

  /* ---------------- Thème clair / sombre ---------------- */
  function getTheme() {
    try { return localStorage.getItem('nafa-theme') === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
  }
  function applyTheme(theme) {
    const dark = theme === 'dark';
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    try { localStorage.setItem('nafa-theme', dark ? 'dark' : 'light'); } catch {}
    const meta = $('#theme-color-meta');
    if (meta) meta.setAttribute('content', dark ? '#0d1411' : '#eef3f1');
    $$('[data-theme-set]').forEach((b) => b.classList.toggle('is-active', b.dataset.themeSet === (dark ? 'dark' : 'light')));
  }

  /* ---------------- Code PIN ---------------- */
  async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  function pinHash() { try { return localStorage.getItem('nafa-pin') || ''; } catch { return ''; } }
  function hasPin() { return !!pinHash(); }

  let pinEntry = '';
  function renderPinDots() {
    $$('#lock-dots .lock__dot').forEach((d, i) => d.classList.toggle('is-on', i < pinEntry.length));
  }
  function showLock() { pinEntry = ''; renderPinDots(); $('#lock-err').hidden = true; $('#lock-screen').hidden = false; }
  function hideLock() { $('#lock-screen').hidden = true; }
  async function pinPress(key) {
    if (key === 'del') { pinEntry = pinEntry.slice(0, -1); renderPinDots(); $('#lock-err').hidden = true; return; }
    if (pinEntry.length >= 4) return;
    pinEntry += key;
    renderPinDots();
    if (pinEntry.length === 4) {
      const ok = (await sha256(pinEntry)) === pinHash();
      if (ok) { hideLock(); }
      else {
        $('#lock-err').hidden = false;
        const inner = $('#lock-screen .lock__inner');
        inner.classList.remove('shake'); void inner.offsetWidth; inner.classList.add('shake');
        pinEntry = ''; renderPinDots();
      }
    }
  }

  function renderSecurity() {
    $('#pin-toggle-btn').textContent = hasPin() ? '🔓 Désactiver le code PIN' : '🔒 Activer le code PIN';
  }
  function openPinModal() {
    $('#pin-modal-code').value = '';
    $('#pin-modal-confirm').value = '';
    $('#pin-modal').hidden = false;
  }
  function closePinModal() { $('#pin-modal').hidden = true; }
  async function savePin() {
    const code = $('#pin-modal-code').value.trim();
    const conf = $('#pin-modal-confirm').value.trim();
    if (!/^\d{4}$/.test(code)) return toast('Choisis 4 chiffres');
    if (code !== conf) return toast('Les deux codes diffèrent');
    try { localStorage.setItem('nafa-pin', await sha256(code)); } catch {}
    closePinModal();
    renderSecurity();
    toast('Code PIN activé ✓');
  }
  function togglePin() {
    if (hasPin()) {
      if (!confirm('Désactiver le code PIN ?')) return;
      try { localStorage.removeItem('nafa-pin'); } catch {}
      renderSecurity();
      toast('Code PIN désactivé');
    } else {
      openPinModal();
    }
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

    // Comptes : seed si vide, puis migration des opérations sans compte
    let accounts = await getAll('accounts');
    if (!accounts.length) {
      accounts = DEFAULT_ACCOUNTS.map((a) => ({ ...a }));
      for (const a of accounts) await put('accounts', a);
    }
    accounts.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    state.accounts = accounts;
    const defaultAcc = accounts[0] ? accounts[0].id : null;
    for (const o of state.operations) {
      if (o.accountId === undefined) {
        o.accountId = defaultAcc;
        await put('operations', o);
      }
    }

    // période historique par défaut = mois
    $$('[data-period]').forEach((x) => x.classList.toggle('is-active', x.dataset.period === 'month'));

    wire();
    applyTheme(getTheme());
    renderSecurity();
    if (hasPin()) showLock();
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
