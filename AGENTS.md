# FRAKTUM Literature engineering rules

- Do not add stubs without an explicit `TODO` explaining the missing behavior.
- No UI control may call an undefined action or function.
- Every feature change requires automated tests.
- Never persist binary/base64 media in JSON or localStorage.
- Never render user HTML without sanitization.
- Avoid giant mutable global state; editor code belongs in `src/editor` modules.
- Every canvas mutation must participate in undo/redo history.
- Cloud saving must not depend solely on a manual save button.
- Production data must never be mixed with demo seed data.
- Do not rewrite a working module without characterization tests.
- Test mobile UX separately from desktop UX.
- A passing build does not establish runtime correctness; run all quality scripts.

## Mandatory Codex Git / Pull Request workflow

These rules are mandatory for every Codex task that changes repository files.

1. Always start from the latest `origin/main`.
   - Fetch/pull before creating the task branch.
   - Never base new work on an old `codex-*`, rescue, staging, or previously used task branch unless the user explicitly requests it.

2. Every task must use a brand-new unique branch.
   - Recommended format: `codex/<YYYYMMDD-HHMM>-<short-task-name>`.
   - Never reuse a branch that already has or previously had a pull request.
   - Never force-push over an older task branch just to create a new PR.

3. Every completed task must open its own Pull Request to `main`.
   - One task = one branch = one PR.
   - Do not silently commit directly to `main`.
   - Do not finish a task after merely pushing the branch; creating the PR is part of the task.
   - If PR creation fails, diagnose and fix the branch/base state and retry. Do not report the task as complete without either a PR URL or a precise blocking GitHub error.

4. Preserve PR history.
   - Never delete or overwrite old PRs.
   - Never repurpose an old PR for unrelated work.
   - Merged and closed PRs remain part of project history and must stay discoverable.
   - Deleting a merged branch is allowed only after merge; the PR itself must remain.

5. Before opening a PR:
   - confirm the branch is ahead of `main`;
   - confirm it has a common ancestor with `main`;
   - rebase or merge the latest `main` if necessary;
   - run the relevant quality checks;
   - push the branch to `origin`.

6. PR body must include:
   - summary of what changed;
   - root cause / motivation;
   - files or subsystems affected;
   - tests/checks actually run and their results;
   - migrations or environment changes;
   - known limitations or unverified runtime behavior.

7. If GitHub reports that a PR already exists for the current head branch:
   - do NOT try to create another PR from the same branch;
   - create a new branch from the latest `main`, cherry-pick or re-apply only the intended new commits, push it, and create a new PR.

8. If the local working tree contains unrelated or uncommitted user work:
   - do not discard, reset, or overwrite it;
   - preserve it in a separate branch/commit first, or work in a clean worktree/branch.

9. Never use `git reset --hard`, destructive cleanup, force-push, or history rewriting on user branches unless the user explicitly asks for it and the consequences are clear.

10. Final response for repository-changing tasks must include the created PR URL and head branch name.
