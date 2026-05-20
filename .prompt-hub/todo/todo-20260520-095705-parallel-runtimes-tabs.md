# Tâche : faire tourner plusieurs runtimes en parallèle (sessions à onglets)

Date : 2026-05-20 09:57:05
Slug : parallel-runtimes-tabs

## Objectif
Permettre l'exécution de plusieurs runtimes simultanément via une UX à onglets dans le
panneau latéral. Un onglet = une session indépendante (process PTY + terminal xterm propres).

## Décisions validées avec l'utilisateur
- UX : onglets dans un seul panneau, bouton « + » pour lancer une session.
- Plusieurs sessions du même runtime autorisées.
- Automatisation : ouvre TOUJOURS un nouvel onglet avec le runtime déclaré (ou runtime par
  défaut si non déclaré), puis envoie le prompt à cette session.

## Plan d'exécution
1. `session-utils.ts` (fonctions pures) + `tests/session-utils.test.ts` + lint glob.
2. Champs settings `autoCloseAutomationSessions`, `maxConcurrentSessions` + sanitizing.
3. Classe `CliSession` + helper `createSessionTerminal()`.
4. Refactor `ClaudeCliView` : sessions[], startSession/closeSession/setActiveSession + onData/onExit/Codex par session.
5. Reconstruire `onOpen()` : barre d'onglets, menu « + », hôte terminaux, recâblage boutons, autoStart -> 1 session.
6. setActiveSession fit/resize à l'activation + observer unique.
7. Auto-close sessions automatisation + plafond maxConcurrentSessions.
8. `activateViewAndStartSession` + réécriture `triggerAutomation`.
9. `automations-modal.ts` : « Run now » toujours actif.
10. Lignes UI settings + CSS onglets.

## Statut
Terminé (implémentation). Test manuel Obsidian restant côté utilisateur.

## Review
- Implémentation conforme au plan validé : sessions à onglets, plusieurs sessions par
  runtime, automatisation -> nouvel onglet (runtime déclaré ou défaut), auto-close + plafond.
- Fonctions de décision isolées dans `session-utils.ts` et couvertes par 15 tests unitaires.
- Pièges xterm gérés : un seul ResizeObserver ciblant la session visible, refit/resize à
  l'activation d'onglet (pas de fit sur terminal `display:none`), reset + NO_COLOR Codex par session.
- Validation : lint OK, 70 tests OK, build esbuild OK, `tsc --noEmit` propre sur le code projet.
- Version 0.2.8 -> 0.2.9 (manifest, versions.json, package.json, version.md alignés).
- Limites / suivi : le champ `autoRestartOnRuntimeSwitch` est conservé dans les settings pour
  éviter une migration mais n'a plus d'effet (nettoyage possible plus tard). Smoke test manuel
  dans Obsidian (ouverture multi-onglets, bascule, fermeture, automatisation) à réaliser.
