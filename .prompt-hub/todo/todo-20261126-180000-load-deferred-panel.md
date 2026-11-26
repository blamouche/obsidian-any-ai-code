# Todo — Fix « Could not open a session » sur panneau différé

## Objectif
Les automations (planifiées ou « Run now ») échouent avec `Could not open a session` quand le panneau Any AI CLI existe dans le layout mais n'a pas été affiché depuis le démarrage d'Obsidian : la feuille est « différée » (Obsidian ≥ 1.7), `leaf.view` n'est pas une `ClaudeCliView`, `activateViewAndStartSession` renvoie null. Régression visible depuis 0.2.20 quand `revealPanelOnAutomation` est désactivé (plus de `revealLeaf`, qui chargeait la vue).

Constat dans un coffre réel : 8 échecs planifiés + 3 manuels avec cette raison dans l'historique.

## Étapes
- [x] `activateView()` : `await leaf.loadIfDeferred()` sur la feuille trouvée/créée, avant le `revealLeaf` éventuel
- [x] lint + tests + build, vérifier la présence dans main.js
- [x] bump 0.2.21 (manifest, package.json, versions.json, version.md), releases.md, memory.md
- [ ] commit/push : en attente du feu vert utilisateur

## Review
## Review (2026-11-26)
`activateView()` charge désormais la feuille différée (`leaf.loadIfDeferred()`) avant le `revealLeaf` optionnel ; couvre les lancements planifiés, « Run now » et toute ouverture de session via `activateViewAndStartSession`.
Validation : lint OK, 79 tests OK, tsc OK, build OK, présent dans main.js. Version 0.2.21.
Statut : completed (hors commit/push, en attente du feu vert). Pas de test unitaire ajouté : le code dépend de l'API workspace d'Obsidian, non mockée dans la suite.
