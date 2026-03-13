# Task: Clean system log lines in embedded terminal

## Context
- Plugin system logs (runtime selected/starting/proxy info) can be appended to active TUI status line from previous process.

## Plan
- [x] Add helper to clear current line before writing plugin system messages.
- [x] Route key plugin log writes through helper.
- [x] Validate build/tests and update traceability.

## Review
- Added `writeSystemLine()` in `main.ts` to clear the active terminal line (`CR + ESC[2K`) before printing plugin messages.
- Routed key plugin lifecycle messages through this helper (`Runtime selected`, `Starting`, `Stopping`, `Restart requested`, startup/exit/error notices).
- Validation:
  - `npm run build` passed.
  - `npm test` passed (`12/12` tests).
