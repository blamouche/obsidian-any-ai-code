# Task: Insert vault-relative active file path in mention

- Timestamp: 20260313-170044
- Status: completed

## Plan
- [x] Re-read mandatory prompt-hub context and restore project state.
- [x] Update active-file mention insertion to use full vault-relative path.
- [x] Update tests for path-based mention behavior.
- [x] Run validation (`npm run build`, `npm test`).
- [x] Update todo review, memory log, version, releases, and sync repository.

## Assumptions
- Expected mention format is `@<vault-relative-path>` with a trailing space.

## Review
- Mention insertion now uses Obsidian vault-relative active file path (`activeFile.path`) instead of file name only.
- Mention format remains `@<path> ` for direct CLI continuation.
- Validation passed (`npm run build`, `npm test`).
