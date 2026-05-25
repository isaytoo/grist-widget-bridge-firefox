# Grist Widget Bridge — Firefox

## Installation temporaire (développement / test)

Firefox permet de charger une extension non signée directement depuis le disque.

1. Ouvrir **`about:debugging`** dans Firefox
2. Cliquer sur **"Ce Firefox"** (panneau gauche)
3. Cliquer sur **"Charger un module complémentaire temporaire…"**
4. Naviguer jusqu'au dossier `grist-widget-bridge-firefox/`
5. Sélectionner le fichier **`manifest.json`**

L'extension est active jusqu'à la fermeture du navigateur. Pour la recharger après un redémarrage, répéter les étapes 3–5.

---

## Installation permanente (Firefox non restreint)

Pour que l'extension persiste entre les redémarrages sans être signée par Mozilla :

1. Ouvrir **`about:config`**
2. Rechercher `xpinstall.signatures.required`
3. Passer la valeur à **`false`**
4. Emballer l'extension en `.zip` (renommer en `.xpi`) :
   ```bash
   cd grist-widget-bridge-firefox
   zip -r ../grist-widget-bridge-firefox.xpi . --exclude "*.md" --exclude ".git*"
   ```
5. Ouvrir **`about:addons`** → cliquer sur ⚙ → **"Installer un module depuis un fichier"**
6. Sélectionner le fichier `.xpi`

> **Note :** Cette méthode ne fonctionne pas sur Firefox ESR entreprise.

---

## Publication sur Firefox Add-ons (AMO)

Pour une distribution officielle via [addons.mozilla.org](https://addons.mozilla.org) :

1. Créer un compte développeur AMO
2. Soumettre l'extension (elle sera signée par Mozilla)
3. Une fois signée, le `.xpi` peut être installé sur n'importe quel Firefox

---

## Compatibilité

| Fonctionnalité               | Firefox requis |
|------------------------------|---------------|
| Manifest V3                  | 109+          |
| `declarativeNetRequest`      | 113+          |
| `scripting` API              | 102+          |
| `modifyHeaders` (CORS)       | 113+          |
| Version minimale recommandée | **128+**      |

---

## Différences avec la version Chrome

| Point                          | Chrome               | Firefox              |
|-------------------------------|----------------------|----------------------|
| `declarativeNetRequestWithHostAccess` | Requis      | Non applicable       |
| `persistAcrossSessions`       | Supporté             | Non supporté → réenregistrement via `onStartup` |
| `browser_specific_settings`   | Non nécessaire       | Requis (gecko id)    |
| API `chrome.*`                | Native               | Shim de compatibilité |
