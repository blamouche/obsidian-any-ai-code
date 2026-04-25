# Task: Add GitHub Action to publish a release on every new tag

## Context
- The plugin currently has only a CI workflow (`.github/workflows/ci.yml`) that runs tests and a build on push/PR.
- For Obsidian plugin distribution, releases must include the bundled assets:
  - `main.js` (built bundle, output of `npm run build`)
  - `manifest.json` (plugin manifest)
  - `styles.css` (plugin stylesheet)
- The release should be created automatically when a new tag is pushed, so the maintainer just needs to push a tag (e.g. `0.1.23`) to publish a new version.

## Plan
1. Create `.github/workflows/release.yml` that:
   - Triggers on tag push (`tags: ['*']`).
   - Checks out the repo, sets up Node 20, installs deps with `npm ci`.
   - Runs the production build (`npm run build`) so `main.js` is regenerated from sources.
   - Creates a GitHub Release using `softprops/action-gh-release` with the tag name as title.
   - Uploads the three Obsidian-required files (`main.js`, `manifest.json`, `styles.css`) as standalone release assets (this matches Obsidian community plugin conventions, where users / Obsidian's update system download these files individually from the release).
2. Validate locally with `npm run build` and `npm test` to confirm nothing in the repo regresses.
3. Update `.prompt-hub/version.md`, `.prompt-hub/releases.md`, and `.prompt-hub/memory.md`.
4. Commit and push.

## Notes
- Using `softprops/action-gh-release@v2` with `GITHUB_TOKEN` (built-in) — no extra secrets required.
- The workflow does not run tests on tag (CI already covers it on every push), it just builds and ships.

## Review
TBD after execution.
