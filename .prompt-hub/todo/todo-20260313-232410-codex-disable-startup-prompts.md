# Task: Reduce Codex hidden startup prompts in embedded terminal

## Context
- Codex startup in bridge mode remained blank and proactive escape injections were echoed as raw text.

## Plan
- [x] Remove proactive/ reactive terminal escape injection that pollutes input stream.
- [x] Launch Codex with config overrides to disable startup prompts/warnings in this embedded context.
- [x] Validate build/tests and document outcome.

## Review
- Removed startup query-response injection path from the view layer.
- Updated Codex command with startup config flags:
  - `check_for_update_on_startup=false`
  - `hide_full_access_warning=true`
  - `hide_world_writable_warning=true`
  - `hide_rate_limit_model_nudge=true`
- Validation:
  - `npm run build` passed.
  - `npm test` passed (`12/12` tests).
