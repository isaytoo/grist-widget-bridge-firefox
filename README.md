# Grist Widget Bridge — extension Chrome

Débloque les widgets Grist personnalisés hébergés sur un autre site que l'instance Grist.

| Problème | Solution |
|----------|----------|
| CORS bloqué sur l'API Grist | En-têtes `Access-Control-Allow-Origin` ajoutés par `declarativeNetRequest` |
| `localStorage` inaccessible dans l'iframe du widget | Proxy transparent sur `chrome.storage.local` |
| Envoi de pièces jointes bloqué (portail d'authentification, CORS) | Relais `postMessage` : la page Grist, qui porte le cookie de session, envoie le fichier |

## Installation (mode développeur)

1. Ouvrir `about:debugging`
2. Activer **Mode développeur** (en haut à droite)
3. **Charger l'extension non empaquetée** → choisir ce dossier
4. Épingler l'icône dans la barre d'outils

Déploiement sur un parc : publier l'extension (modules complémentaires de Firefox, éventuellement en
« non répertoriée ») puis la forcer par stratégie `ExtensionInstallForcelist`.

## Utilisation

1. Sur une page de votre instance Grist → **« + Comme instance Grist »**
2. Sur la page de votre widget → **« + Comme widget »** (ou saisir son origine dans
   « Ajouter un widget »)
3. Recharger les onglets concernés

Le relais de pièces jointes n'accepte que les widgets déclarés, et seulement depuis une
iframe de la page Grist.

## Configuration intégrée (2.6)

Cette version est préconfigurée pour la Métropole de Lyon : à l'installation, et à chaque mise
à jour, elle déclare d'elle-même

- l'instance Grist `https://grist.grandlyon.fr`
- l'hébergeur des widgets `https://grist-custom-widgets-grandlyon-60b9d7.forge-pages.grandlyon.com/*`

Rien à configurer sur les postes. Les entrées ajoutées à la main restent possibles et sont
conservées. Pour une autre instance ou un autre hébergeur, modifier `PRECONFIG` en tête de
`background.js`.

## Nouveautés 2.5

- Relais de pièces jointes : le document est trouvé quel que soit le format de l'adresse
  (`/doc/<id>`, `/<id>/<titre>`, `/o/<équipe>/<id>/…`), et l'identifiant transmis par le
  widget est utilisé en priorité. La 2.4 échouait sur `grist.grandlyon.fr/o/docs/…`.
- Version Chrome (service worker Manifest V3).

## Protocole du relais (pour les widgets)

```js
// 1. Découverte
parent.postMessage({ _gristBridge: true, type: 'HANDSHAKE', version: '1' }, '*');
// ← { _gristBridge: true, type: 'HANDSHAKE_ACK', version: '1' }   (e.origin = page Grist)

// 2. Envoi, un fichier par message
parent.postMessage({ _gristBridge: true, type: 'UPLOAD', version: '1', requestId,
  payload: { base64, name, type, docId } }, origineGrist);
// ← { _gristBridge: true, requestId, result: [idPièceJointe] }  ou  { …, error }
```

Les identifiants s'écrivent dans une colonne Pièces jointes sous la forme `['L', ...ids]`.

## Licence

MIT · © 2025-2026 Saïd Hamadou ([@isaytoo](https://github.com/isaytoo))
