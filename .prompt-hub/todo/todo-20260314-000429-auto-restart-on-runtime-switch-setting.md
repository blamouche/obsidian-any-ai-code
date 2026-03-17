# Task: Add auto-restart option on runtime switch

## Context
- User wants a settings option to automatically restart when switching model/runtime from toolbar.

## Plan
- [x] Add `autoRestartOnRuntimeSwitch` setting with default value.
- [x] Use this setting in runtime switch flow to trigger automatic restart when process is running.
- [x] Add toggle in configuration panel.
- [x] Validate build/tests and update traceability.

## Review
- Added persisted setting `autoRestartOnRuntimeSwitch` (default `false`).
- Runtime switch flow now auto-restarts current process when this option is enabled.
- Added `Auto-restart on runtime switch` toggle in settings panel.
- Validation:
  - `npm run build` passed.
  - `npm test` passed (`12/12` tests).
