/**
 * content-script.js
 * ─────────────────
 * S'injecte dans votre widget (l'iframe sur La Forge).
 * Résout "DOMException: The operation is insecure" sur localStorage.
 *
 * Stratégie :
 *   1. On tente d'utiliser localStorage normalement.
 *   2. Si le navigateur le bloque (iframe cross-origin, cookies tiers
 *      désactivés), on bascule automatiquement sur chrome.storage.local
 *      qui lui est toujours accessible depuis une extension.
 *   3. On remplace window.localStorage par un proxy transparent :
 *      le code existant du widget n'a rien à changer.
 */

(function patchLocalStorage() {
  'use strict';

  // ── Test : localStorage est-il accessible ? ──────────────────────────
  let nativeAvailable = false;
  try {
    localStorage.setItem('__ext_test', '1');
    localStorage.removeItem('__ext_test');
    nativeAvailable = true;
  } catch (_) {
    nativeAvailable = false;
  }

  if (nativeAvailable) {
    // Tout va bien, pas besoin du patch
    console.debug('[GristBridge] localStorage accessible nativement.');
    return;
  }

  console.info('[GristBridge] localStorage bloqué — activation du proxy via chrome.storage.');

  // ── Cache mémoire synchrone ───────────────────────────────────────────
  // chrome.storage.local est asynchrone, mais localStorage est synchrone.
  // On maintient un cache en mémoire pour satisfaire les appels synchrones,
  // et on synchronise en arrière-plan avec chrome.storage.local.
  let memCache = {};
  let cacheLoaded = false;

  // Charger le cache depuis chrome.storage au démarrage
  chrome.storage.local.get(null, items => {
    memCache = items ?? {};
    cacheLoaded = true;
    // Déclencher un événement pour signaler que le cache est prêt
    window.dispatchEvent(new CustomEvent('grist-storage-ready'));
  });

  // ── Proxy localStorage ────────────────────────────────────────────────
  const storageProxy = {
    // Lire une valeur
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(memCache, key)
        ? String(memCache[key])
        : null;
    },

    // Écrire une valeur
    setItem(key, value) {
      const str = String(value);
      memCache[key] = str;
      // Persistance asynchrone en arrière-plan
      chrome.storage.local.set({ [key]: str });
    },

    // Supprimer une valeur
    removeItem(key) {
      delete memCache[key];
      chrome.storage.local.remove(key);
    },

    // Vider tout
    clear() {
      memCache = {};
      chrome.storage.local.clear();
    },

    // Nombre d'entrées
    get length() {
      return Object.keys(memCache).length;
    },

    // Accès par index (compatibilité API)
    key(index) {
      return Object.keys(memCache)[index] ?? null;
    },
  };

  // Rendre le proxy accessible comme un objet normal (getItem, setItem…)
  // ET via la syntaxe localStorage['clé'] ou localStorage.clé
  const handler = {
    get(target, prop) {
      if (prop in target) return target[prop];
      // Accès style localStorage.darkMode
      return Object.prototype.hasOwnProperty.call(memCache, prop)
        ? String(memCache[prop])
        : null;
    },
    set(target, prop, value) {
      if (prop in target) return false;
      // Assignation style localStorage.darkMode = true
      storageProxy.setItem(prop, value);
      return true;
    },
  };

  const proxy = new Proxy(storageProxy, handler);

  // ── Remplacement de window.localStorage ──────────────────────────────
  try {
    Object.defineProperty(window, 'localStorage', {
      get: () => proxy,
      configurable: true,
    });
    Object.defineProperty(window, 'sessionStorage', {
      get: () => proxy,
      configurable: true,
    });
    console.info('[GristBridge] Proxy localStorage installé.');
  } catch (e) {
    console.warn('[GristBridge] Impossible de remplacer localStorage :', e.message);
  }

})();
