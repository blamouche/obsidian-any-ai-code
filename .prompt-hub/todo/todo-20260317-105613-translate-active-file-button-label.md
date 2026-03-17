# Task: Translate active-file toolbar button label to English

## Context
- User requested translating the toolbar button label from French to English.
- Target button currently shown as `@Fichier actif`.

## Plan
- [x] Locate UI label usage in source files.
- [x] Replace label with English wording and keep behavior unchanged.
- [x] Run build/tests.
- [x] Update Prompt Hub tracking (`version`, `releases`, `memory`) and add review.

## Review
- Updated toolbar button text and icon label from `@Fichier actif` to `@Active file` in `main.ts`.
- Rebuilt plugin output (`main.js`) and validated with `npm run build` and `npm test` (12/12 passing).
