# Task: Create branch `feature/automation`

## Objective
Create a new git branch `feature/automation` off `main` for upcoming automation work, applying the Prompt Hub branch protocol (minor version bump, releases log, memory log).

## Plan
1. Verify working tree is clean and `main` is up to date with origin.
2. Create branch `feature/automation` from `main` and switch to it.
3. Bump `.prompt-hub/version.md` from `0.1.48` to `0.2.0` (new branch → minor bump).
4. Add a `0.2.0` entry to `.prompt-hub/releases.md` noting the new branch.
5. Append a memory log entry for this action.
6. Commit the version/releases bump on the new branch.
7. Push the branch to `origin` with upstream tracking.

## Review
- _to be filled in after execution_
