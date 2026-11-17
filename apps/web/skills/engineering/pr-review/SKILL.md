---
name: pr-review
version: 1.0.0
description: "AI pull-request review: pull a GitHub PR's diff, hunt for bugs, security issues and regressions the way a senior reviewer would, then report findings with severity and file/line references — and optionally post the review or ship fixes. Requires the user's GitHub connector."
---

# AI Pull-Request Review

Review a GitHub pull request end to end: understand the change, hunt for
real defects, report them with exact locations, and (only when asked) post
the review or fix the findings. Use the user's GitHub connector tool
(`github`) for every repository read and write.

## Workflow

### 1. Establish the change

- If the user gave a PR number, call `github` with
  `{ action: "get_pr", repository, pullNumber }`.
- If they described a change without a number, call
  `{ action: "list_prs", repository }` and ask them to confirm which one.
- From `get_pr` you have: author, head/base branches, head SHA, additions/
  deletions, changed-file count, and the truncated description. Restate the
  intent of the change in one sentence before diving in.

### 2. Read the diff

- Call `github` with `{ action: "get_pr_files", repository, pullNumber }`.
  This returns up to 20 changed files with per-file patches.
- Files beyond the first 20, or patches marked `…[truncated]`, need direct
  reads: `{ action: "get_file", repository, path, ref }` with the PR's head
  branch.
- Read surrounding context with `get_file` whenever a hunk touches logic you
  cannot judge from the patch alone: the function under change, its callers,
  the types it depends on, and adjacent exports in the same file.

### 3. Hunt for defects (in this order)

1. **Correctness** — logic errors, inverted conditions, off-by-one errors,
   wrong variable used, missing null/undefined guards, incorrect error
   handling (swallowed errors, missing await, unhandled promise rejection).
2. **Security** — injection (SQL/command/XSS), secrets or tokens in code or
   logs, missing authorization checks, user input reaching dangerous sinks,
   unsafe deserialization, SSRF in URL handling.
3. **Regressions** — behavior the change silently breaks: renamed/removed
   exports other files import, changed function signatures, dropped
   validation, altered defaults, broken invariants the surrounding code
   relies on.
4. **Concurrency and resources** — race conditions, unclosed connections/
   streams/file handles, unbounded loops, N+1 queries, missing pagination
   caps on provider calls.
5. **Edge cases** — empty arrays/strings, zero/negative numbers, huge
   payloads, unicode, timezone-sensitive date math, concurrent duplicate
   submissions.

Only report what you can point to. Never speculate about code you did not
read; open the file with `get_file` first.

### 4. Report findings

For each finding give: **severity** (blocker / should-fix / nit), the file
and approximate line, what is wrong, why it matters (the failure mode, not
just the rule), and a concrete suggested fix. Lead with the verdict: is this
PR safe to merge as-is? If you found nothing real, say so plainly — a
review with only nits should say the PR is safe and list the nits last.

### 5. Optional: post the review (requires user approval)

To publish the review as a GitHub PR comment:

1. Call `proposeConnectorAction` with
   `provider: "github"`, `action: "create_pr_review"`, and the exact payload
   `{ repository, pullNumber, body }`. The review body must be the complete
   findings report — the user approves exactly this text.
2. After approval, call `github` with
   `{ action: "create_pr_review", repository, pullNumber, body, approvalToken }`.
   Reviews are posted as `COMMENT` events — they never approve or
   request-changes on their own.

### 6. Optional: fix the findings (requires user approval per write)

When the user wants the issues fixed:

1. `proposeConnectorAction` → `github` / `create_branch` with
   `{ repository, branchName, fromSha }` (fromSha = the PR head SHA or the
   base SHA they want to branch from).
2. For each file to change: `get_file` on the branch to obtain the current
   `sha`, then `proposeConnectorAction` → `github` / `update_file` with
   `{ repository, path, branchName, fileSha, commitMessage, fileContent }`.
3. `proposeConnectorAction` → `github` / `create_pull_request` with
   `{ repository, title, headRef, baseBranch, body }` — the body lists the
   findings each commit addresses.

Every write is one-use, owner-bound and expires in 5 minutes: the approved
payload must match the tool call exactly. Never batch different content into
an approved call — get a fresh approval instead.

## Boundaries

- Read actions are always allowed for repositories the user's GitHub account
  can access; every write needs an explicit user-approved token.
- Do not push to `main`/`master` directly: create a feature branch and open
  a PR, even for one-line fixes.
- If `get_pr_files` shows a diff for generated or vendored files, note them
  but spend the review effort on the hand-written code.
- Keep review bodies factual and specific; no generic praise.
