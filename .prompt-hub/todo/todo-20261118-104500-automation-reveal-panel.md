# Todo — Option: reveal side panel on automation launch

## Objectif
Ajouter un réglage permettant de choisir si le lancement d'une automation rend visible (révèle/focus) le panneau latéral. `true` par défaut (comportement actuel).

## Étapes
- [ ] Ajouter `revealPanelOnAutomation: boolean` à `ClaudeCliPluginSettings` + `DEFAULT_SETTINGS` (true)
- [ ] Hydrater le réglage dans `loadSettings()`
- [ ] `activateView(options?: { reveal?: boolean })` : créer le leaf sans `revealLeaf` ni `active: true` si reveal=false
- [ ] `activateViewAndStartSession` propage `reveal`
- [ ] Toggle UI dans la section Automations
- [ ] Doc embarquée AUTOMATION-DOCS / README si pertinent
- [ ] lint + tests + build, bump version, commit/push

## Review
(à compléter)
