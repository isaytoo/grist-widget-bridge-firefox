/**
 * grist-host-bridge.js
 * ─────────────────────
 * Injecté dans le contexte de la PAGE PARENTE Grist (même domaine que l'API
 * → pas de CORS pour la requête finale). Reçoit des messages postMessage
 * depuis les iframes-widgets, et relaie l'upload d'attachements via l'API.
 *
 * Sécurité :
 *   - n'accepte que les origines présentes dans la config (storage.sync.widgetUrls)
 *   - vérifie que la source est bien une iframe enfant
 *   - limite la taille d'upload
 *   - ne relaie qu'un type d'opération : POST /attachments
 */

(function installGristAttachmentBridge() {
  'use strict';

  if (window.__gristAttachmentBridge) {
    console.info('[GristBridge] Déjà installé.');
    return;
  }
  window.__gristAttachmentBridge = true;

  const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 Mo
  const PROTOCOL_VERSION = '1';

  // Origines autorisées : dérivées dynamiquement depuis la config
  let allowedOrigins = new Set();

  function refreshAllowedOrigins() {
    try {
      chrome.storage.sync.get({ widgetUrls: [] }, ({ widgetUrls }) => {
        const set = new Set();
        for (const pattern of widgetUrls || []) {
          // Extraire l'origine d'un pattern type "https://foo.bar/*"
          const m = String(pattern).match(/^(https?:\/\/[^/*]+)/i);
          if (m) set.add(m[1]);
        }
        // Toujours autoriser les origines de dev locales
        set.add('http://localhost:8080');
        set.add('http://localhost:3000');
        allowedOrigins = set;
      });
    } catch (e) {
      // Hors contexte d'extension : on garde le set existant
    }
  }
  refreshAllowedOrigins();

  // Rafraîchir si la config change
  try {
    chrome.storage.onChanged?.addListener?.((changes, area) => {
      if (area === 'sync' && changes.widgetUrls) refreshAllowedOrigins();
    });
  } catch (_) {}

  // ── Résolution du endpoint Grist ────────────────────────────────────
  function resolveApiBase() {
    try {
      const cfg = window.gristConfig;
      if (cfg?.homeUrl) {
        const m = location.pathname.match(/\/doc\/([^/?#]+)/);
        if (m) return `${cfg.homeUrl.replace(/\/$/, '')}/api/docs/${m[1]}`;
      }
    } catch (_) {}
    const m = location.pathname.match(/^(\/o\/[^/]+)?\/doc\/([^/?#]+)/);
    if (!m) throw new Error('[GristBridge] Impossible de déterminer le docId depuis l\'URL.');
    return `${location.origin}${m[1] ?? ''}/api/docs/${m[2]}`;
  }

  function getAuthHeaders() {
    return { 'X-Requested-With': 'XMLHttpRequest' };
  }

  async function doUpload({ base64, name, type }) {
    const byteLength = Math.floor((base64.length * 3) / 4);
    if (byteLength > MAX_FILE_BYTES) {
      throw new Error(`Fichier trop volumineux (${(byteLength / 1024 / 1024).toFixed(1)} Mo > ${MAX_FILE_BYTES / 1024 / 1024} Mo)`);
    }
    const byteString = atob(base64);
    const buf = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) buf[i] = byteString.charCodeAt(i);
    const blob = new Blob([buf], { type });

    const formData = new FormData();
    formData.append('upload', blob, name);

    const apiBase = resolveApiBase();
    const resp = await fetch(`${apiBase}/attachments`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: formData,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Grist API ${resp.status}: ${text.slice(0, 200)}`);
    }
    const ids = await resp.json();
    return Array.isArray(ids) ? ids : [ids];
  }

  // ── Listener ────────────────────────────────────────────────────────
  async function onMessage(event) {
    const msg = event.data;
    if (!msg?._gristBridge) return;

    if (!allowedOrigins.has(event.origin)) {
      console.warn(`[GristBridge] Origine refusée : ${event.origin}`);
      return;
    }

    const iframes = Array.from(document.querySelectorAll('iframe'));
    if (!iframes.some(f => f.contentWindow === event.source)) {
      console.warn('[GristBridge] Source inconnue — message ignoré.');
      return;
    }

    const { type, requestId, payload, version } = msg;

    if (type === 'HANDSHAKE') {
      if (version !== PROTOCOL_VERSION) {
        console.warn(`[GristBridge] Version incompatible : attendu ${PROTOCOL_VERSION}, reçu ${version}`);
      }
      event.source.postMessage(
        { _gristBridge: true, type: 'HANDSHAKE_ACK', version: PROTOCOL_VERSION },
        event.origin
      );
      console.info(`[GristBridge] Handshake avec ${event.origin}`);
      return;
    }

    if (type === 'UPLOAD') {
      try {
        const result = await doUpload(payload);
        event.source.postMessage({ _gristBridge: true, requestId, result }, event.origin);
      } catch (err) {
        console.error('[GristBridge] Erreur upload :', err);
        event.source.postMessage({ _gristBridge: true, requestId, error: err.message }, event.origin);
      }
      return;
    }

    console.warn(`[GristBridge] Type de message inconnu : ${type}`);
  }

  window.addEventListener('message', onMessage);
  console.info('[GristBridge] Bridge installé. En attente de widgets…');

})();
