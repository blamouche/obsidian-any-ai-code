# Task: Automations — prompts récurrents depuis un dossier vault

Branch: `feature/automation`
Plan: `/Users/benoitlamouche/.claude/plans/j-aimerais-ajouter-une-option-magical-river.md`

## Objective
Permettre à l'utilisateur de définir un dossier de prompts (markdown + frontmatter) qui sont auto-envoyés au CLI selon une récurrence (interval ou cron) ou manuellement depuis un bouton de toolbar. Historique des exécutions tracké et consultable.

## Plan d'exécution
1. Ajouter `cron-parser` aux dépendances.
2. Créer `automation.ts` — parser frontmatter, types, `computeNextRun`, `isDue`, `pushHistory` (logique pure).
3. Créer `tests/automation.test.ts` — couverture parser + scheduling + ring buffer.
4. Étendre `ClaudeCliPluginSettings` + `DEFAULT_SETTINGS` + `loadSettings` dans `main.ts` (champs automations).
5. Ajouter scheduler + `triggerAutomation` + `recordHistory` + `loadAutomations` à la classe `ClaudeCliPlugin`.
6. Ajouter méthode publique `sendAutomationPrompt` sur `ClaudeCliView`.
7. Ajouter section "Automations" au settings tab.
8. Ajouter bouton "Automations" dans la toolbar du panel + wire vers modal.
9. Créer `automations-modal.ts` (onglets Automations / History).
10. Ajouter styles modal dans `styles.css`.
11. Lint + build + typecheck + tests.
12. Mettre à jour README.
13. Bumper version + releases + memory + review du todo.
14. Commit + push.

## Review
- Implémenté la feature complète selon le plan :
  - `automation.ts` (parser frontmatter + `computeNextRun` / `isDue` / `pushHistory` / `buildPromptPreview` / `describeSchedule`).
  - `tests/automation.test.ts` — 28 cas (parsing OK + erreurs, scheduling interval/cron, ring-buffer truncation, preview formatting).
  - `main.ts` — étendu `ClaudeCliPluginSettings` + `loadSettings` (avec `sanitizeLastRun` / `sanitizeHistory`), scheduler plugin-level via `activeWindow.setInterval` + 30 s tick + `onLayoutReady` initial tick, vault `create/modify/delete/rename` events filtrés sur le préfixe de dossier, `triggerAutomation` avec `scheduler`/`manual` source, `recordHistory` + `clearAutomationHistory`, méthodes publiques `isProcessRunning` / `getRunningRuntimeId` / `matchesRuntime` / `sendAutomationPrompt` sur `ClaudeCliView`.
  - Nouveau bouton "Automations" dans la toolbar (`secondaryRowEl`) avec icône `calendar-clock`, ouvre `AutomationsModal`.
  - Section settings "Automations" (champ `automationsFolder` + bouton `Reload now`).
  - `automations-modal.ts` — onglets **Automations** (tableau Name/Schedule/Last run/Next run/Status/Actions, Run now désactivé si CLI off, Open file, erreurs de parsing en haut) et **History** (liste capée, badges colorés par status, `Clear history`, `Export as markdown`).
  - `styles.css` — styles modal complets (tabs, table, badges, history list).
  - `README.md` — entrée feature + section **Automations** (setup, format, manual runs + history).
  - Deps : `cron-parser` (runtime), `yaml` (dev).
- Validations :
  - `npm run lint` → clean (corrections : `activeWindow.setInterval`, suppression `console.info/error`, sentence-case "Markdown"/"readme", typage `unknown` du parser YAML dans les tests).
  - `npm run build` → OK.
  - `npm test` → 55 tests pass (28 nouveaux + 27 existants).
- Bumped version 0.2.0 → 0.2.1, log mémoire ajouté.
- Statut : **completed** (reste : commit + push, et test manuel utilisateur dans un vault de dev).
