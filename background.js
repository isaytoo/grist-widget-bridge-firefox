/**
 * background.js — Service worker
 * ───────────────────────────────────────────────
 * Gère 3 choses, dynamiquement, à partir de la config stockée :
 *   1. Règles declarativeNetRequest (CORS Grist + Origin-Agent-Cluster widgets)
 *   2. Enregistrement des content scripts (bridge sur Grist + proxy localStorage sur widgets)
 *   3. Synchronisation lorsque la config change (depuis popup ou options)
 *
 * La config a la forme :
 *   {
 *     gristUrls:  ['https://docs.getgrist.com', ...],
 *     widgetUrls: ['https://mon-widget.example.fr/*', ...]
 *   }
 */

const DEFAULTS = {
  gristUrls:    ['https://docs.getgrist.com'],
  widgetUrls:   [],
  externalApis: [],
};

const BRIDGE_SCRIPT_ID = 'grist-host-bridge';
const WIDGET_SCRIPT_ID = 'grist-widget-storage-proxy';

// ─── Lifecycle ─────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  const cfg = await getConfig();
  await applyAll(cfg);
});

chrome.runtime.onStartup.addListener(async () => {
  const cfg = await getConfig();
  await applyAll(cfg);
});

// ─── Messages depuis popup / options ──────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'UPDATE_CONFIG') {
    (async () => {
      await chrome.storage.sync.set(msg.cfg);
      await applyAll(msg.cfg);
      sendResponse({ ok: true });
    })();
    return true; // async response
  }
  if (msg?.type === 'GET_CONFIG') {
    getConfig().then(cfg => sendResponse({ ok: true, cfg }));
    return true;
  }
});

// ─── Config helpers ───────────────────────────────────────────────────
async function getConfig() {
  const cfg = await chrome.storage.sync.get(DEFAULTS);
  // Migration depuis l'ancien schéma (gristUrl unique → gristUrls[])
  if (cfg.gristUrl && !cfg.gristUrls?.length) {
    cfg.gristUrls = [cfg.gristUrl];
    await chrome.storage.sync.set({ gristUrls: cfg.gristUrls });
    await chrome.storage.sync.remove('gristUrl');
  }
  return {
    gristUrls:    Array.isArray(cfg.gristUrls)    ? cfg.gristUrls    : DEFAULTS.gristUrls,
    widgetUrls:   Array.isArray(cfg.widgetUrls)   ? cfg.widgetUrls   : DEFAULTS.widgetUrls,
    externalApis: Array.isArray(cfg.externalApis) ? cfg.externalApis : DEFAULTS.externalApis,
  };
}

// ─── Application complète : règles + scripts ──────────────────────────
async function applyAll(cfg) {
  await Promise.all([
    applyRules(cfg),
    applyContentScripts(cfg),
  ]);
}

// ─── Règles declarativeNetRequest ─────────────────────────────────────
async function applyRules(cfg) {
  const { gristUrls, widgetUrls, externalApis } = cfg;

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map(r => r.id);

  const addRules = [];
  let id = 1;

  // 1) Origin-Agent-Cluster: ?0  → débloque localStorage cross-origin
  for (const filter of widgetUrls) {
    addRules.push({
      id: id++,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        responseHeaders: [
          { header: 'Origin-Agent-Cluster', operation: 'set', value: '?0' },
        ],
      },
      condition: {
        urlFilter: filter,
        resourceTypes: ['sub_frame', 'main_frame'],
      },
    });
  }

  // 2) CORS sur l'API de chaque instance Grist
  for (const gristUrl of gristUrls) {
    const apiPattern = gristUrl.replace(/\/$/, '') + '/api/*';
    addRules.push({
      id: id++,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        responseHeaders: [
          { header: 'Access-Control-Allow-Origin',      operation: 'set', value: '*' },
          { header: 'Access-Control-Allow-Credentials', operation: 'set', value: 'true' },
          { header: 'Access-Control-Allow-Methods',     operation: 'set', value: 'GET, POST, OPTIONS, PATCH, PUT, DELETE' },
          { header: 'Access-Control-Allow-Headers',     operation: 'set', value: 'Authorization, Content-Type, X-Requested-With' },
        ],
      },
      condition: {
        urlFilter: apiPattern,
        resourceTypes: ['xmlhttprequest', 'other'],
      },
    });
  }

  // 3) CORS sur les APIs externes (Cloudinary, S3, etc.)
  const apis = Array.isArray(externalApis) ? externalApis : DEFAULTS.externalApis;
  for (const apiPattern of apis) {
    addRules.push({
      id: id++,
      priority: 2,
      action: {
        type: 'modifyHeaders',
        responseHeaders: [
          { header: 'Access-Control-Allow-Origin',  operation: 'set', value: '*' },
          { header: 'Access-Control-Allow-Methods', operation: 'set', value: 'GET, POST, PUT, OPTIONS' },
          { header: 'Access-Control-Allow-Headers', operation: 'set', value: 'Authorization, Content-Type, X-Requested-With' },
        ],
      },
      condition: {
        urlFilter: apiPattern,
        resourceTypes: ['xmlhttprequest', 'other'],
      },
    });
  }

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
  console.info('[GristBridge] Règles actives :', addRules.length);
}

// ─── Enregistrement dynamique des content scripts ─────────────────────
async function applyContentScripts(cfg) {
  const { gristUrls, widgetUrls } = cfg;

  // Convertir les URLs en match patterns valides
  const gristMatches  = gristUrls.map(u => toMatchPattern(u, true)).filter(Boolean);
  const widgetMatches = widgetUrls.map(u => toMatchPattern(u, true)).filter(Boolean);

  // Désinscrire d'abord tout ce qu'on a posé
  const registered = await chrome.scripting.getRegisteredContentScripts({
    ids: [BRIDGE_SCRIPT_ID, WIDGET_SCRIPT_ID],
  }).catch(() => []);
  const toRemove = registered.map(s => s.id);
  if (toRemove.length) {
    await chrome.scripting.unregisterContentScripts({ ids: toRemove });
  }

  const scripts = [];
  if (gristMatches.length) {
    scripts.push({
      id: BRIDGE_SCRIPT_ID,
      js: ['grist-host-bridge.js'],
      matches: gristMatches,
      runAt: 'document_idle',
      // persistAcrossSessions non supporté sur Firefox — réenregistrement via onStartup
      world: 'ISOLATED',
    });
  }
  if (widgetMatches.length) {
    scripts.push({
      id: WIDGET_SCRIPT_ID,
      js: ['content-script.js'],
      matches: widgetMatches,
      runAt: 'document_start',
      allFrames: true,
      // persistAcrossSessions non supporté sur Firefox — réenregistrement via onStartup
      world: 'ISOLATED',
    });
  }

  if (scripts.length) {
    try {
      await chrome.scripting.registerContentScripts(scripts);
      console.info('[GristBridge] Content scripts enregistrés :', scripts.map(s => s.id).join(', '));
    } catch (err) {
      console.error('[GristBridge] Échec enregistrement content scripts :', err.message);
    }
  }
}

// ─── Conversion URL → match pattern ───────────────────────────────────
// Exemples :
//   https://grist.example.org              → https://grist.example.org/*
//   https://grist.example.org/             → https://grist.example.org/*
//   https://grist.example.org/o/foo        → https://grist.example.org/o/foo*
//   https://grist.example.org/*            → tel quel
function toMatchPattern(url, addTrailingStar) {
  let u = (url || '').trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  if (addTrailingStar && !u.endsWith('*')) {
    u = u.replace(/\/?$/, '/*');
  }
  return u;
}
