# Todo — Terminal illisible quand la session démarre panneau caché

## Objectif
Une session lancée panneau caché (automation avec « Reveal the side panel » désactivé, ou lancement depuis un autre plugin en arrière-plan) s'affiche cassée à l'ouverture du panneau : lignes qui se chevauchent, fragments dupliqués. Cause : le conteneur caché ne se mesure pas. `FitAddon.fit()` ne fait rien (xterm reste en 80×24) ou réduit à 2 colonnes (largeur 0 mais cellule mesurée). Le PTY démarre avec `max(20, cols)`, donc xterm et le CLI ne s'accordent pas sur la largeur. À l'ouverture, le redimensionnement fait reflow d'xterm et le TUI (Claude Code / Ink) se redessine avec un compte de lignes faux.

## Étapes
- [x] helper pur `resolveTerminalSize()` (session-utils.ts) + tests
- [x] vue : `sizeSession()` unique (visible → taille ajustée et mémorisée ; caché → dernière taille visible) ; PTY redimensionné seulement si la taille change ; spawn avec la taille exacte du terminal
- [x] taille visible persistée (`settings.terminalSize`, sauvegarde debouncée ; `app.saveLocalStorage` exige Obsidian 1.8.7) pour le premier lancement après redémarrage
- [x] lint + tests + tsc + build
- [x] bump 0.2.22, releases.md, memory.md

## Review
## Review (2026-11-26)
Une seule fonction `sizeSession()` dimensionne xterm et le PTY : taille ajustée quand le panneau est visible (mémorisée), dernière taille visible quand il est caché ; spawn avec la taille exacte ; resize PTY seulement si elle change.
Validation : lint OK, 86 tests OK, tsc OK hors node_modules, build OK. Version 0.2.22.
Statut : completed (hors commit/push/release, en attente du feu vert). Non vérifié dans Obsidian : la première session après mise à jour, panneau jamais affiché, garde l'ancien comportement tant qu'aucune taille n'a été mesurée.
