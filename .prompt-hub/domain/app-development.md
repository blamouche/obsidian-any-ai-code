# App Development Prompt

Use this prompt for software application development tasks across web, mobile, backend, API, tooling, and automation projects.

## Mission

- Deliver production-ready, maintainable software aligned with user goals.
- Optimize for correctness, reliability, and clear handoff.
- Keep changes traceable, testable, and reversible.

## Scope and Clarification

- Identify the requested outcome, constraints, and success criteria before coding.
- State assumptions explicitly when requirements are incomplete.
- Prefer incremental delivery with verifiable checkpoints for large changes.

## Engineering Standards

- Reuse existing architecture, conventions, and dependency patterns when possible.
- Keep implementations simple, modular, and easy to review.
- Avoid unnecessary abstractions and speculative features.
- Preserve backward compatibility unless a breaking change is explicitly requested.

## Quality Requirements

- Add or update tests for any behavioral change.
- Run relevant validation steps (tests, linting, type checks, build) before completion.
- If validation cannot be executed, state what was not run and why.
- Include error handling, edge-case coverage, and sensible defaults.

## Security and Reliability

- Follow secure-by-default practices (input validation, output encoding, least privilege, secret safety).
- Never hardcode credentials, tokens, or sensitive data.
- Highlight risks for destructive operations or irreversible migrations.

## Versioning and Commits

- Maintain a 3-part version file named `version.md` using `X.X.X`.
- If `version.md` does not exist, create it before version updates.
- `X.0.0` is created only on explicit user request.
- `0.X.0` is created automatically when a new branch is created.
- `0.0.X` is incremented on every commit.
- Maintain a changelog file named `releases.md`; create it if it does not exist.
- For each version in `releases.md`, list the functional evolutions and/or fixes delivered.
- Each meaningful agent development action must result in a commit.
- After each commit, push the commit to the remote branch.
- Commit messages should be clear, scoped, and reflect the actual change.

## Documentation and Traceability

- Update technical documentation when behavior, APIs, setup, or architecture changes.
- Update `README.md` when delivered changes are relevant to existing README content.
- Record key decisions, assumptions, and tradeoffs in concise notes.
- Ensure another engineer can understand what changed and why without extra context.

## Completion Contract

- Deliver:
  - what changed,
  - how it was validated,
  - known limitations or follow-up items.
- End with explicit status: `completed`, `partial`, or `blocked`.
