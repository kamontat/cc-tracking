---
name: shipping-a-change
description: Use when starting any code, style, config, docs or CI change in cc-tracking — a feature, bugfix, refactor or tweak — before editing a file, including one-line fixes and changes the user calls small.
---

# Shipping a change

## Overview

Every change in this repo lives in its own worktree and branch, is built test-first, and
ends with a pull request whose preview deployment URL goes back to the user. Nothing is
edited on `main`, and nothing is merged here — merging is `landing-a-change`, and only after
the user approves.

**Violating the letter of these steps is violating their spirit.** The user set this
workflow, so only their explicit words skip a step ("skip the test for this one"). Hurry,
size or "just" are not permission. When they do skip one, say which in the PR test plan.

## Steps

1. **Worktree.** Call `EnterWorktree` with a short kebab-case `name` describing the change
   (no `worktree-` prefix — the tool adds it). It creates `.claude/worktrees/<name>` on branch `worktree-<name>` from `origin/main`.
   Already inside a worktree for this change? Keep using it. Then run `bun install` — a new
   worktree has no `node_modules`.
2. **Test first.** REQUIRED SUB-SKILL: superpowers:test-driven-development. Write the
   failing test next to the code (`*.test.ts`), run `bun test <file>` and watch it fail for
   the right reason.
3. **Code.** Write the smallest code that passes. Follow the design system rules in
   `AGENTS.md` (tokens only through `var(--cc-*)`, the three button variants, no selectors
   on translated text). User-facing text lives in `src/lib/i18n/en.ts` and `th.ts`;
   change both.
4. **Check, format, test.** All must pass before committing:
   ```sh
   bun run format      # biome check --unsafe --write
   bun run check       # biome check
   bun run typecheck
   bun run test
   bun run build
   ```
   A failure means fix and rerun the whole list, not commit and fix later. `format` rewrites
   files, so stage after it (`git add -A`), and check `git status` for stray files.
5. **Commit.** Conventional commits, lower case, scoped to the area:
   `feat(cards): ...`, `fix(purchases): ...`, `ci: ...`. One logical change per commit.
   Do not touch `CHANGELOG.md` yet — that happens when landing.
6. **Push.** `git push -u origin HEAD` (SSH push works without a token).
7. **Pull request.** GitHub API calls need the personal account token:
   ```sh
   GH_TOKEN=$(gh auth token --user kamontat) gh pr create --base main \
     --title "<type>(<scope>): <summary>" --body "<Summary bullets + Test plan>"
   ```
   Body: `## Summary` bullets, `## Test plan` checklist (tests ticked, preview checks
   unticked), then the Claude Code attribution line. Pushing more commits to an open PR
   updates it — don't open a second one.
8. **Deployed URL.** Wait for the preview deploy, then report the URL:
   ```sh
   GH_TOKEN=$(gh auth token --user kamontat) gh pr checks <number> --watch
   ```
   The URL is `https://pr-<number>-cc-tracking.kcinth.workers.dev`. Report it only after
   the `deploy` check passes; if it fails, say so with the failing line.

Then stop and hand the user the PR link and preview URL. Wait for their approval before
using `landing-a-change`.

## Red flags — stop

| Thought | Reality |
|---|---|
| "Tiny change, I'll edit on main" | Every change gets a worktree. Main only moves by merge. |
| "I'll add the test after" | Test first, and watch it fail. |
| "CSS/copy change, nothing to test" | Test the rendered text, class or attribute. Only layout and colour that happy-dom can't compute go untested; list them as preview checks in the PR. |
| "CI will run check for me" | Run the full list locally before committing. |
| "Deploy is probably fine" | Report the URL only after the check passes. |
| "User said ok earlier, I'll merge" | Approval is per change, after they see the preview. |
