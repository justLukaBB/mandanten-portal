# Contributing to Mandanten-Portal

## Bug Workflow

1. **Pick an issue** — Go to GitHub Issues, pick one assigned to you
2. **Create a branch** — `fix/123-short-description` (from `main`)
3. **Read the docs** — Check `DEVELOPER_GUIDE.md` for relevant context
4. **Fix the bug** — Make minimal, focused changes
5. **Test locally** — Verify the fix works, check for regressions
6. **Commit** — `fix: short description (#123)`
7. **Push & PR** — Push branch, open PR using the template
8. **Wait for review** — Do not merge yourself

## Branch Naming

| Type | Format | Example |
|------|--------|---------|
| Bug fix | `fix/ISSUE-description` | `fix/123-login-redirect-loop` |
| Feature | `feat/ISSUE-description` | `feat/456-creditor-export` |
| Hotfix | `hotfix/ISSUE-description` | `hotfix/789-crash-on-upload` |

Always branch from `main`. Keep branch names short and descriptive.

## Commit Format

```
type: short description (#issue)
```

Types: `fix`, `feat`, `refactor`, `docs`, `chore`, `test`

Examples:
- `fix: prevent duplicate creditor entries (#123)`
- `feat: add PDF export for settlement plans (#456)`
- `refactor: extract email service from controller (#789)`

## Pull Request Rules

1. **One issue per PR** — Keep changes focused
2. **Fill out the PR template** — Summary, changes, checklist
3. **Link the issue** — Use `Closes #123` in the PR description
4. **No debug code** — Remove all `console.log`, test data, commented-out code
5. **No unrelated changes** — Don't fix "other stuff" in the same PR
6. **Test before pushing** — Both frontend and backend if your change touches both

## Using Claude Code

You can use [Claude Code](https://docs.anthropic.com/en/docs/claude-code) to help fix bugs:

```bash
cd mandanten-portal
claude                    # Opens Claude Code with CLAUDE.md context
```

Claude Code automatically reads `CLAUDE.md` for project context. Ask it to:
- Explain how a feature works
- Find the root cause of a bug
- Suggest a fix
- Write the fix and test it

## Code Style

- Follow existing patterns — don't introduce new frameworks or libraries without approval
- Use Tailwind for styling, shadcn/ui for components
- Keep functions small and focused
- Name variables and functions descriptively (English)
- UI labels and user-facing text stay in German

## Questions?

If something is unclear, ask in the issue comments before starting work. Better to clarify upfront than to redo work.
