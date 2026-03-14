# Task: Improve toolbar button visuals with icons

## Context
- User asked for prettier button pictograms in toolbar.

## Plan
- [x] Add icon rendering helper for toolbar buttons.
- [x] Apply icons to command buttons and runtime switch buttons.
- [x] Add CSS tweaks for icon/text alignment.
- [x] Validate build/tests and update traceability.

## Review
- Added `setButtonIcon()` helper using Obsidian `setIcon()` for toolbar buttons.
- Applied icons to Start/Stop/Restart/Clear/Active file and Claude/Codex switch buttons.
- Added CSS alignment and icon sizing rules for cleaner button visuals.
- Validation:
  - `npm run build` passed.
  - `npm test` passed (`12/12` tests).
