# Task: Focus CLI after active-file button click

## Context
- User request: when clicking the button that adds the current file, automatically move focus to the CLI so typing can continue without extra click.

## Plan
- [x] Locate active-file button click handler and current input focus flow.
- [x] Update behavior to focus CLI input after mention insertion.
- [x] Validate with build/tests and document outcome.

## Review
- Updated `insertActiveFileMention()` in `main.ts` to call `this.terminal?.focus()` right after writing the active-file mention to the running process.
- Validation:
  - `npm run build` passed.
  - `npm test` passed (`12/12` tests).
