# Task: Rework settings screen coherence + auto-restart default ON

## Context
- User requests a more globally coherent settings screen.
- User requests auto-restart on runtime switch default to ON.

## Plan
- [x] Reorganize settings UI into coherent sections and harmonized labels/descriptions.
- [x] Set `autoRestartOnRuntimeSwitch` default value to `true`.
- [x] Validate with build/tests.
- [x] Update traceability/versioning and push.

## Review
- Reworked settings screen structure with clear sections: `Runtime behavior`, `Commands`, and `Advanced`.
- Added a top settings heading/intro for overall coherence.
- Harmonized command labels/descriptions (`Claude command`, `Codex command`).
- Changed default `autoRestartOnRuntimeSwitch` to `true`.
- Validation:
  - `npm run build` passed.
  - `npm test` passed (`12/12` tests).
