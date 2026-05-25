# Grist Widget Bridge — Firefox Extension

> **English version below** · [Jump to English](#english)

---

## Français

### Présentation

**Grist Widget Bridge** est une extension Firefox qui résout les trois blocages courants lors du développement de widgets personnalisés pour [Grist](https://getgrist.com) :

| Problème | Solution |
|----------|----------|
| CORS bloqué sur l'API Grist | Injection des headers `Access-Control-Allow-Origin` via `declarativeNetRequest` |
| `localStorage` inaccessible dans les iframes cross-origin | Proxy transparent basé sur `browser.storage.local` |
| Upload de fichiers impossible depuis un widget externe | Pont `postMessage` relayé par la page Grist parente |

### Installation

#### Depuis Firefox Add-ons (AMO) — recommandé
🔗 [addons.mozilla.org/fr/firefox/addon/grist-widget-bridge](https://addons.mozilla.org/fr/firefox/addon/grist-widget-bridge)

#### Chargement temporaire (développement)
1. Ouvrir `about:debugging` dans Firefox
2. Cliquer sur **"Ce Firefox"**
3. Cliquer sur **"Charger un module complémentaire temporaire…"**
4. Sélectionner le fichier `manifest.json` de ce dossier

### Utilisation

1. Cliquer sur l'icône 🔌 dans la barre d'outils Firefox
2. Sur la page de votre instance Grist → **"+ Comme instance Grist"**
3. Sur la page de votre widget → **"+ Comme widget"**
4. Recharger les onglets concernés

### Configuration avancée

Cliquer sur **⚙ Options** dans le popup pour gérer manuellement les URLs, ajouter des APIs externes (Cloudinary, S3, Supabase…), ou réinitialiser la configuration.

### Compatibilité

- Firefox **140+** (requis pour `data_collection_permissions`)
- Firefox pour Android : non testé

### Confidentialité

Aucune donnée utilisateur n'est collectée ni transmise à des tiers. L'extension n'agit que sur les URLs explicitement configurées par l'utilisateur.

### Licence

[MIT](LICENSE) · © 2025 Saïd Hamadou ([@isaytoo](https://github.com/isaytoo))

---

## English <a name="english"></a>

### Overview

**Grist Widget Bridge** is a Firefox extension that solves three common issues when developing custom widgets for [Grist](https://getgrist.com):

| Problem | Solution |
|---------|----------|
| CORS blocked on Grist API | Injects `Access-Control-Allow-Origin` headers via `declarativeNetRequest` |
| `localStorage` unavailable in cross-origin iframes | Transparent proxy backed by `browser.storage.local` |
| File upload impossible from an external widget | `postMessage` bridge relayed by the parent Grist page |

### Installation

#### From Firefox Add-ons (AMO) — recommended
🔗 [addons.mozilla.org/en-US/firefox/addon/grist-widget-bridge](https://addons.mozilla.org/en-US/firefox/addon/grist-widget-bridge)

#### Temporary load (development)
1. Open `about:debugging` in Firefox
2. Click **"This Firefox"**
3. Click **"Load Temporary Add-on…"**
4. Select the `manifest.json` file from this folder

### Usage

1. Click the 🔌 icon in the Firefox toolbar
2. On your Grist instance page → **"+ As Grist instance"**
3. On your widget page → **"+ As widget"**
4. Reload the relevant tabs

### Advanced configuration

Click **⚙ Options** in the popup to manually manage URLs, add external APIs (Cloudinary, S3, Supabase…), or reset the configuration.

### Compatibility

- Firefox **140+** (required for `data_collection_permissions`)
- Firefox for Android: untested

### Privacy

No user data is collected or transmitted to third parties. The extension only acts on URLs explicitly configured by the user.

### Chrome version

Looking for the Chrome version? → [github.com/isaytoo/grist-widget-bridge](https://github.com/isaytoo/grist-widget-bridge)

### License

[MIT](LICENSE) · © 2025 Saïd Hamadou ([@isaytoo](https://github.com/isaytoo))
