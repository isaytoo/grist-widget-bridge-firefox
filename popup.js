/**
 * popup.js — Logique du menu d'extension
 * ─────────────────────────────────────────
 * - Détecte l'onglet courant
 * - Permet d'ajouter rapidement son origine comme Grist ou comme Widget
 * - Affiche la liste des adresses configurées avec suppression
 * - Recharge l'onglet pour appliquer les changements
 */

const $ = id => document.getElementById(id);

let cfg = { gristUrls: [], widgetUrls: [], externalApis: [] };
let currentTab = null;

// ─── Init ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  renderVersion();
  await Promise.all([loadConfig(), loadCurrentTab()]);
  render();
  bindEvents();
});

function renderVersion() {
  const { version, name } = chrome.runtime.getManifest();
  $('version').textContent = `${name} · v${version}`;
}

async function loadConfig() {
  const resp = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });
  cfg = resp?.cfg ?? { gristUrls: [], widgetUrls: [], externalApis: [] };
  if (!Array.isArray(cfg.externalApis)) cfg.externalApis = [];
}

async function loadCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab ?? null;
}

// ─── Rendu ────────────────────────────────────────────────────────────
function render() {
  renderStatus();
  renderQuickActions();
  renderList();
}

function renderStatus() {
  const dot  = $('statusDot');
  const text = $('statusText');
  const url  = $('tabUrl');
  const builderHint = $('builderHint');

  const isGristLabsBuilder = currentTab?.url && originOf(currentTab.url) === 'https://gristlabs.github.io';
  builderHint?.classList.toggle('hidden', !isGristLabsBuilder);

  if (!currentTab?.url || !/^https?:/i.test(currentTab.url)) {
    dot.className  = 'status-dot inactive';
    text.textContent = 'Onglet non compatible';
    url.textContent  = currentTab?.url ?? '—';
    return;
  }

  url.textContent = currentTab.url;

  const match = matchTab(currentTab.url);
  if (match === 'grist') {
    dot.className   = 'status-dot grist';
    text.textContent = 'Instance Grist active';
  } else if (match === 'widget') {
    dot.className   = 'status-dot widget';
    text.textContent = 'Widget bridgé actif';
  } else {
    dot.className   = 'status-dot inactive';
    text.textContent = 'Aucune règle pour cet onglet';
  }
}

function renderQuickActions() {
  const addSection    = $('addSection');
  const removeSection = $('removeSection');
  const hintSection   = $('hintSection');

  // Cas 1 : onglet non http(s) (chrome://, about:, file://...)
  if (!currentTab?.url || !/^https?:/i.test(currentTab.url)) {
    addSection.classList.add('hidden');
    removeSection.classList.add('hidden');
    hintSection.classList.remove('hidden');
    return;
  }

  hintSection.classList.add('hidden');
  removeSection.classList.add('hidden');
  addSection.classList.remove('hidden');

  const origin   = originOf(currentTab.url);
  const isGrist  = cfg.gristUrls.some(u => normalize(u) === normalize(origin));
  const isWidget = cfg.widgetUrls.some(u => urlMatchesPattern(currentTab.url, u));

  // Bouton Grist
  const gristBtn  = $('addAsGristBtn');
  if (gristBtn) {
    const gristSpan = gristBtn.querySelector('span');
    if (isGrist) {
      if (gristSpan) gristSpan.textContent = '− Retirer comme instance Grist';
      gristBtn.className = 'btn btn-secondary';
    } else {
      if (gristSpan) gristSpan.textContent = '+ Comme instance Grist';
      gristBtn.className = 'btn btn-primary';
    }
  }

  // Bouton Widget — grisé si on est sur une page Grist (capte la mauvaise origine)
  const widgetBtn  = $('addAsWidgetBtn');
  if (widgetBtn) {
    const widgetSpan = widgetBtn.querySelector('span');
    if (isWidget) {
      if (widgetSpan) widgetSpan.textContent = '− Retirer comme widget';
      widgetBtn.className = 'btn btn-secondary';
      widgetBtn.disabled = false;
      widgetBtn.title = '';
      widgetBtn.style.opacity = '';
    } else if (isGrist) {
      if (widgetSpan) widgetSpan.textContent = '+ Comme widget';
      widgetBtn.className = 'btn btn-warm';
      widgetBtn.disabled = true;
      widgetBtn.title = 'Vous êtes sur la page Grist — utilisez le champ ci-dessous ou ouvrez le widget dans un onglet.';
      widgetBtn.style.opacity = '0.35';
    } else {
      if (widgetSpan) widgetSpan.textContent = '+ Comme widget';
      widgetBtn.className = 'btn btn-warm';
      widgetBtn.disabled = false;
      widgetBtn.title = '';
      widgetBtn.style.opacity = '';
    }
  }
}

function renderList() {
  const list = $('urlList');
  list.innerHTML = '';
  const all = [
    ...cfg.gristUrls.map(u => ({ url: u, kind: 'grist'  })),
    ...cfg.widgetUrls.map(u => ({ url: u, kind: 'widget' })),
    ...(cfg.externalApis || []).map(u => ({ url: u, kind: 'api' })),
  ];

  if (!all.length) {
    list.innerHTML = '<div class="empty-list">Aucune adresse configurée</div>';
    return;
  }

  for (const { url, kind } of all) {
    const div = document.createElement('div');
    div.className = `url-item ${kind}`;
    div.dataset.url = url;
    div.dataset.kind = kind;
    const badgeLabel = kind === 'grist' ? 'Grist' : kind === 'widget' ? 'Widget' : 'API';

    const dot = document.createElement('span');
    dot.className = 'url-dot ok';
    dot.title = 'Vérification…';

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = badgeLabel;

    const spanUrl = document.createElement('span');
    spanUrl.className = 'url';
    spanUrl.title = url;
    spanUrl.textContent = url;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Supprimer');
    btn.textContent = '×';
    btn.addEventListener('click', () => removeUrl(kind, url));

    div.appendChild(dot);
    div.appendChild(badge);
    div.appendChild(spanUrl);
    div.appendChild(btn);
    list.appendChild(div);
  }

  refreshDots();
}

async function refreshDots() {
  const items = document.querySelectorAll('.url-item');
  for (const item of items) {
    const ok = await isPermitted(item.dataset.url, item.dataset.kind);
    const dot = item.querySelector('.url-dot');
    if (!dot) continue;
    dot.classList.toggle('ok',   ok);
    dot.classList.toggle('warn', !ok);
    dot.title = ok
      ? 'Permission accordée — règle active'
      : 'Permission manquante — re-ajoutez l\'URL pour la rendre active';
  }
}

async function isPermitted(url, kind) {
  const pattern = kind === 'grist'
    ? url.replace(/\/+$/, '') + '/*'
    : (url.endsWith('*') ? url : url.replace(/\/?$/, '/*'));
  try { return await chrome.permissions.contains({ origins: [pattern] }); }
  catch { return false; }
}

// ─── Actions ──────────────────────────────────────────────────────────
function bindEvents() {
  $('addAsGristBtn').addEventListener('click', () => addCurrent('grist'));
  $('addAsWidgetBtn').addEventListener('click', () => addCurrent('widget'));
  $('removeBtn').addEventListener('click', () => addCurrent('grist'));
  $('manualGristAddBtn').addEventListener('click', addManualGrist);
  $('manualGristUrl').addEventListener('keydown', e => e.key === 'Enter' && addManualGrist());
  $('manualWidgetAddBtn').addEventListener('click', addManualWidget);
  $('manualWidgetUrl').addEventListener('keydown', e => e.key === 'Enter' && addManualWidget());
  $('manualApiAddBtn').addEventListener('click', addManualApi);
  $('manualApiUrl').addEventListener('keydown', e => e.key === 'Enter' && addManualApi());
  $('reloadBtn').addEventListener('click', () => {
    if (currentTab?.id) chrome.tabs.reload(currentTab.id);
    window.close();
  });
  $('optionsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });
}

async function addCurrent(kind) {
  if (!currentTab?.url) return;
  const origin = originOf(currentTab.url);
  const value  = kind === 'grist' ? origin : origin + '/*';
  if (!value) return showNotice('URL invalide.', 'err');

  const key      = kind === 'grist' ? 'gristUrls' : 'widgetUrls';
  const isGrist  = cfg.gristUrls.some(u => normalize(u) === normalize(origin));
  const isWidget = cfg.widgetUrls.some(u => urlMatchesPattern(currentTab.url, u));
  const already  = kind === 'grist' ? isGrist : isWidget;

  if (already) {
    if (kind === 'grist') {
      cfg.gristUrls = cfg.gristUrls.filter(u => normalize(u) !== normalize(origin));
    } else {
      cfg.widgetUrls = cfg.widgetUrls.filter(u => !urlMatchesPattern(currentTab.url, u));
    }
    await saveConfig();
    render();
    showNotice('Retiré. Rechargez l\'onglet.', 'ok');
  } else {
    // Permission demandée en premier, directement sur le geste utilisateur
    const pattern = value.endsWith('/*') ? value : value + '/*';
    const granted = await chrome.permissions.request({ origins: [pattern] });
    if (!granted) return showNotice('Permission refusée.', 'err');
    cfg[key] = [...cfg[key], value];
    await saveConfig();
    render();
    showNotice(`Ajouté. Rechargez l'onglet.`, 'ok');
  }
}

async function addManualGrist() {
  let value = $('manualGristUrl').value.trim();
  if (!value) return;
  if (!/^https?:\/\//i.test(value)) value = 'https://' + value;
  value = value.replace(/\/+$/, '').replace(/\/\*+$/, '');
  if (cfg.gristUrls.some(u => normalize(u) === normalize(value))) return showNotice('Déjà présent.', 'err');
  const granted = await chrome.permissions.request({ origins: [value + '/*'] });
  if (!granted) return showNotice('Permission refusée.', 'err');
  cfg.gristUrls = [...cfg.gristUrls, value];
  $('manualGristUrl').value = '';
  await saveConfig();
  render();
  showNotice('Instance Grist ajoutée. Rechargez l\'onglet.', 'ok');
}

async function addManualWidget() {
  let value = $('manualWidgetUrl').value.trim();
  if (!value) return;
  if (!/^https?:\/\//i.test(value)) value = 'https://' + value;
  if (!value.endsWith('*')) value = value.replace(/\/?$/, '/*');
  if (cfg.widgetUrls.includes(value)) return showNotice('Déjà présent.', 'err');
  // Permission demandée en premier, directement sur le geste utilisateur
  const granted = await chrome.permissions.request({ origins: [value] });
  if (!granted) return showNotice('Permission refusée.', 'err');
  cfg.widgetUrls = [...cfg.widgetUrls, value];
  $('manualWidgetUrl').value = '';
  await saveConfig();
  render();
  showNotice('Widget ajouté. Rechargez l\'onglet widget.', 'ok');
}

async function removeUrl(kind, url) {
  const key = kind === 'grist' ? 'gristUrls' : kind === 'widget' ? 'widgetUrls' : 'externalApis';
  cfg[key] = cfg[key].filter(u => u !== url);
  await saveConfig();
  render();
  showNotice('Adresse retirée.', 'ok');
}

async function addManualApi() {
  let value = $('manualApiUrl').value.trim();
  if (!value) return;
  if (!/^https?:\/\//i.test(value)) value = 'https://' + value;
  if (!value.endsWith('*')) value = value.replace(/\/?$/, '/*');
  if ((cfg.externalApis || []).includes(value)) return showNotice('Déjà présent.', 'err');
  const granted = await chrome.permissions.request({ origins: [value] });
  if (!granted) return showNotice('Permission refusée.', 'err');
  cfg.externalApis = [...(cfg.externalApis || []), value];
  $('manualApiUrl').value = '';
  await saveConfig();
  render();
  showNotice('API externe ajoutée. Rechargez l\'onglet widget.', 'ok');
}

async function saveConfig() {
  await chrome.runtime.sendMessage({ type: 'UPDATE_CONFIG', cfg });
}

// ─── Matching helpers ─────────────────────────────────────────────────
function matchTab(tabUrl) {
  if (!tabUrl) return null;
  const origin = originOf(tabUrl);
  if (cfg.gristUrls.some(u => normalize(u) === normalize(origin))) return 'grist';
  if (cfg.widgetUrls.some(u => urlMatchesPattern(tabUrl, u)))      return 'widget';
  return null;
}

function originOf(url) {
  try { return new URL(url).origin; }
  catch { return ''; }
}

function normalize(u) {
  return (u || '').replace(/\/+$/, '').replace(/\/?\*+$/, '').toLowerCase();
}

// Implémentation simple de match patterns Chrome (https://*.foo/*).
function urlMatchesPattern(url, pattern) {
  if (!pattern || !url) return false;
  // Échappement regex sauf * → .*
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  try { return new RegExp('^' + escaped + '$').test(url); }
  catch { return false; }
}

// ─── UI utils ─────────────────────────────────────────────────────────
function showNotice(msg, type) {
  const n = $('notice');
  n.textContent = msg;
  n.className   = `notice ${type} show`;
  setTimeout(() => n.classList.remove('show'), 3500);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
