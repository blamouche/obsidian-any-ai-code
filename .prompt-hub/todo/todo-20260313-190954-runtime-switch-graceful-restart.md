# Task: Graceful runtime switch restart flow

## Context
- Logs show runtime switch from Claude to Codex can report misleading status and fail to start immediately due to process still shutting down.

## Plan
- [x] Update runtime/process state tracking to distinguish selected runtime vs running runtime.
- [x] Make Start perform graceful switch (stop then auto-start selected runtime once exited).
- [x] Validate build/tests and document outcome.

## Review
- Added runtime state tracking for selected runtime vs currently running runtime.
- Updated `Start` behavior: if a different runtime is selected while one is running, it now performs a graceful switch (stop current process, then auto-start selected runtime on exit).
- Added explicit restart flow and ensured manual `Stop` cancels pending auto-restart.
- Validation:
  - `npm run build` passed.
  - `npm test` passed (`12/12` tests).
