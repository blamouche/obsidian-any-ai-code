# Todo — Option: reveal side panel on automation launch

## Objectif
Ajouter un réglage permettant de choisir si le lancement d'une automation rend visible (révèle/focus) le panneau latéral. `true` par défaut (comportement actuel).

## Étapes
- [x] Ajouter `revealPanelOnAutomation: boolean` à `ClaudeCliPluginSettings` + `DEFAULT_SETTINGS` (true)
- [x] Hydrater le réglage dans `loadSettings()`
- [x] `activateView(options?: { reveal?: boolean })` : créer le leaf sans `revealLeaf` ni `active: true` si reveal=false
- [x] `activateViewAndStartSession` propage `reveal`
- [x] Toggle UI dans la section Automations
- [x] Doc embarquée AUTOMATION-DOCS / README si pertinent
- [x] lint + tests + build, bump version, commit/push

## Review
(à compléter)

## Review (2026-11-18)
Toutes les étapes faites. `revealPanelOnAutomation` (défaut true) ajouté à l'interface, aux defaults et à `loadSettings`; `activateView({ reveal })` crée le leaf avec `active: reveal` et saute `revealLeaf` si false; `activateViewAndStartSession` propage l'option; toggle UI dans la section Automations; README mis à jour. AUTOMATION-DOCS.md non touché (il documente les options du fichier d'automation, pas les réglages du plugin).
Validation : lint OK, 79 tests OK, build OK, présent dans main.js. Commit beaefac poussé sur main. Version 0.2.20.
Statut : completed. Suite possible : publier la release GitHub 0.2.20 (en attente du feu vert).
