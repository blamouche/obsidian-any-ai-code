# Custom Prompts

Place your project-specific custom prompt files (`.md`) in this folder (`.prompt-hub/app/`).

## Persistence

Custom files added here are **never overwritten or deleted** during updates. They are safe to edit and will be preserved across all future installs and updates.

## How it works

All files in `.prompt-hub/app/` are automatically merged into `agents.md` each time the installer runs.

## After adding or editing a custom prompt

Re-run the installer from your project directory to regenerate `agents.md`:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/blamouche/prompt-hub/main/install-prompt-hub.sh)
```
