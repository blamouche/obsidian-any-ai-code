# Task: Fix Codex startup with no visible output

## Context
- User reports Codex launch shows no output in terminal view.

## Plan
- [x] Reproduce/inspect startup flow for early-exit race.
- [x] Fix process adapter to avoid dropping early stdout/stderr/exit events.
- [x] Validate with build/tests and document outcome.

## Review
- Root cause identified: output/exit events could occur before `onData`/`onExit` callbacks were registered, causing silent startup failures.
- Updated `makeProxyAdapter` to register process listeners immediately, buffer early output/exit events, and replay them when callbacks attach.
- Updated mention insertion warning to use selected runtime label (`Claude`/`Codex`).
- Validation:
  - `npm run build` passed.
  - `npm test` passed (`12/12` tests).
