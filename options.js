/**
 * options.js — Page de configuration avancée
 * ─────────────────────────────────────────────
 * Permet de gérer manuellement les listes d'URLs Grist et widgets.
 * Toute modification est immédiatement appliquée par le service worker.
 */

const DEFAULTS = {
  gristUrls:  ['https://docs.getgrist.com'],
  widgetUrls: [],
};

const $ = id => document.getElementById(id);
let state = { gristUrls: [], widgetUrls: [] };

// ─── Init ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const resp = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });
  state = resp?.cfg ?? { ...DEFAULTS };
  renderAll();
  bind();
});

function bind() {
  $('add-grist').addEventListener('click', () => addUrl('grist'));
  $('add-widget').addEventListener('click', () => addUrl('widget'));
  $('new-grist').addEventListener('keydown',  e => e.key === 'Enter' && addUrl('grist'));
  $('new-widget').addEventListener('keydown', e => e.key === 'Enter' && addUrl('widget'));
  $('btn-reset').addEventListener('click', reset);
}

// ─── Rendu ────────────────────────────────────────────────────────────
function renderAll() {
  renderList('grist',  state.gristUrls,  'grist-list');
  renderList('widget', state.widgetUrls, 'widget-list');
}

function renderList(kind, urls, containerId) {
  const list = $(containerId);
  list.innerHTML = '';
  if (!urls.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Aucune adresse configurée';
    list.appendChild(empty);
    return;
  }
  urls.forEach((url, i) => {
    const div = document.createElement('div');
    div.className = `url-item ${kind}`;

    const spanUrl = document.createElement('span');
    spanUrl.className = 'url';
    spanUrl.title = url;
    spanUrl.textContent = url;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Supprimer');
    btn.textContent = '×';
    btn.addEventListener('click', () => removeAt(kind, i));

    div.appendChild(spanUrl);
    div.appendChild(btn);
    list.appendChild(div);
  });
}

// ─── Actions ──────────────────────────────────────────────────────────
async function addUrl(kind) {
  const input = kind === 'grist' ? $('new-grist') : $('new-widget');
  let value = input.value.trim();
  if (!value) return;
  if (!/^https?:\/\//i.test(value)) value = 'https://' + value;

  if (kind === 'widget' && !value.endsWith('*')) {
    value = value.replace(/\/?$/, '/*');
  }
  if (kind === 'grist') {
    value = value.replace(/\/+$/, '');
  }

  const key = kind === 'grist' ? 'gristUrls' : 'widgetUrls';
  if (state[key].includes(value)) {
    input.classList.add('error');
    return notice('Déjà dans la liste.', 'err');
  }
  input.classList.remove('error');

  const pattern = value.endsWith('/*') ? value : value + '/*';
  const granted = await chrome.permissions.request({ origins: [pattern] });
  if (!granted) return notice('Permission refusée.', 'err');
  state[key] = [...state[key], value];
  input.value = '';
  await save();
  renderAll();
  notice(`Ajouté. Rechargez l'onglet concerné pour appliquer.`, 'ok');
}

async function removeAt(kind, index) {
  const key = kind === 'grist' ? 'gristUrls' : 'widgetUrls';
  state[key] = state[key].filter((_, i) => i !== index);
  await save();
  renderAll();
  notice('Retiré.', 'ok');
}

async function reset() {
  if (!confirm('Remettre la configuration par défaut ?')) return;
  state = { ...DEFAULTS };
  await save();
  renderAll();
  notice('Configuration réinitialisée.', 'ok');
}

async function save() {
  await chrome.runtime.sendMessage({ type: 'UPDATE_CONFIG', cfg: state });
}

// ─── Helpers ──────────────────────────────────────────────────────────
function notice(msg, type) {
  const n = $('notice');
  n.textContent = msg;
  n.className = `notice ${type} show`;
  setTimeout(() => n.classList.remove('show'), 4000);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
