# Task: Add active-file mention button in plugin console

- Timestamp: 20260313-165508
- Status: completed

## Plan
- [x] Inspect current toolbar/terminal implementation.
- [x] Add a toolbar button that injects `@<active-file>.md` into the running console process.
- [x] Add/update unit tests for mention formatting logic.
- [x] Run validation (`npm run build`, `npm test`).
- [x] Update review notes and prompt-hub governance files.

## Assumptions
- Mention format expected by user is filename only (`@monfichier.md`), not full vault path.

## Review
- Added `@Fichier actif` toolbar button in the Claude view.
- Button now inserts `@<active-file-name>.md` into the running process input stream.
- Added tests for mention formatting helper and validated with build + tests.
