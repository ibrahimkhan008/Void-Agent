import { tool } from "ai";
import {
  ConnectorApiError,
  callConnectorApi,
} from "lib/connectors/provider-api";
import { connectorActionApprovalRepository } from "lib/db/pg/repositories/connector-action-approval-repository.pg";
import { z } from "zod";

const repository = z
  .string()
  .regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/u);
const approvalToken = z.string().min(43).max(43);
// Branch names: GitHub's git ref rules, bounded. No spaces, no git
// metacharacters, no leading/trailing slash.
// Git ref rules, slash-tolerant ("fix/inventory" is a normal branch name):
// no leading digit-slash weirdness, no "..", no "//", no trailing "/", no
// trailing ".lock", no git metacharacters (space ~ ^ : ? * [ \).
const branchRefPattern = /^[A-Za-z0-9][A-Za-z0-9_./-]{0,140}$/u;
const branchRefRefinements = [
  {
    check: (value: string) => !value.includes(".."),
    message: "ref cannot contain '..'",
  },
  {
    check: (value: string) => !value.includes("//"),
    message: "ref cannot contain '//'",
  },
  {
    check: (value: string) => !value.endsWith("/"),
    message: "ref cannot end with '/'",
  },
  {
    check: (value: string) => !value.endsWith(".lock"),
    message: "ref cannot end with '.lock'",
  },
];
const branchName = z
  .string()
  .regex(branchRefPattern)
  .refine(
    (value) => branchRefRefinements.every(({ check }) => check(value)),
    "Branch name violates git ref rules",
  );
// head for create_pull_request allows the cross-repo "owner:branch" form.
const headRef = z
  .string()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_./-]{0,140}(:[A-Za-z0-9][A-Za-z0-9_./-]{0,140})?$/u,
  )
  .refine(
    (value) => branchRefRefinements.every(({ check }) => check(value)),
    "Head ref violates git ref rules",
  );
// Repository content paths: relative, no traversal, no null bytes.
const filePath = z
  .string()
  .min(1)
  .max(400)
  .refine((value) => !value.startsWith("/"), "Path must be relative")
  .refine((value) => !value.includes(".."), "Path cannot contain '..'")
  .refine(
    (value) => !/[\0\r\n]/u.test(value),
    "Path contains invalid characters",
  )
  .refine(
    (value) =>
      !value.split("/").some((segment) => segment === "" || segment === "."),
    "Path contains an empty or '.' segment",
  );
const commitMessage = z.string().min(1).max(1_000);
const reviewBody = z.string().min(1).max(20_000);

const schema = z.discriminatedUnion("action", [
  // ---- reads (unchanged surface) ----
  z
    .object({
      action: z.literal("list_repos"),
      maxResults: z.number().int().min(1).max(30).optional().default(10),
    })
    .strict(),
  z
    .object({
      action: z.literal("list_issues"),
      repository,
      state: z.enum(["open", "closed", "all"]).optional().default("open"),
      maxResults: z.number().int().min(1).max(30).optional().default(10),
    })
    .strict(),
  z
    .object({
      action: z.literal("get_issue"),
      repository,
      issueNumber: z.number().int().min(1).max(2_147_483_647),
    })
    .strict(),
  z
    .object({
      action: z.literal("list_prs"),
      repository,
      state: z.enum(["open", "closed", "all"]).optional().default("open"),
      maxResults: z.number().int().min(1).max(30).optional().default(10),
    })
    .strict(),
  // ---- reads for the review flow ----
  z
    .object({
      action: z.literal("get_pr"),
      repository,
      pullNumber: z.number().int().min(1).max(2_147_483_647),
    })
    .strict(),
  z
    .object({
      action: z.literal("get_pr_files"),
      repository,
      pullNumber: z.number().int().min(1).max(2_147_483_647),
    })
    .strict(),
  z
    .object({
      action: z.literal("get_file"),
      repository,
      path: filePath,
      ref: branchName.optional(),
    })
    .strict(),
  // ---- writes (each requires an exact owner-bound approval) ----
  z
    .object({
      action: z.literal("create_branch"),
      repository,
      branchName,
      fromSha: z.string().regex(/^[0-9a-f]{7,40}$/iu),
      approvalToken,
    })
    .strict(),
  z
    .object({
      action: z.literal("update_file"),
      repository,
      path: filePath,
      branchName,
      fileSha: z.string().regex(/^[0-9a-f]{7,40}$/iu),
      commitMessage,
      fileContent: z.string().min(1).max(100_000),
      approvalToken,
    })
    .strict(),
  z
    .object({
      action: z.literal("create_pull_request"),
      repository,
      title: z.string().min(1).max(500),
      headRef,
      baseBranch: branchName,
      body: z.string().max(20_000).optional(),
      approvalToken,
    })
    .strict(),
  z
    .object({
      action: z.literal("create_pr_review"),
      repository,
      pullNumber: z.number().int().min(1).max(2_147_483_647),
      body: reviewBody,
      approvalToken,
    })
    .strict(),
]);

const MAX_PATCH_CHARS = 16_000;
const MAX_FILE_CHARS = 100_000;
const MAX_PR_BODY_CHARS = 8_000;

const rejectApproval = () =>
  new ConnectorApiError(
    "This exact GitHub action has not been approved or its approval expired",
  );

/** Bounded view of a PR so a huge description cannot flood the context. */
const summarizePullRequest = (pr: Record<string, unknown>) => ({
  number: pr.number,
  title: pr.title,
  state: pr.state,
  draft: pr.draft === true,
  author: (pr.user as Record<string, unknown> | undefined)?.login,
  head: (pr.head as Record<string, unknown> | undefined)?.ref,
  headSha: (pr.head as Record<string, unknown> | undefined)?.sha,
  base: (pr.base as Record<string, unknown> | undefined)?.ref,
  additions: pr.additions,
  deletions: pr.deletions,
  changedFiles: pr.changed_files,
  mergeable: pr.mergeable,
  htmlUrl: pr.html_url,
  body:
    typeof pr.body === "string" && pr.body.length > MAX_PR_BODY_CHARS
      ? `${pr.body.slice(0, MAX_PR_BODY_CHARS)}…[truncated]`
      : pr.body,
});

export function createGitHubToolForUser(userId: string) {
  return tool({
    description:
      "GitHub for this signed-in user. Reads: list repositories, issues, one issue, pull requests, one pull request, a PR's changed files (with diffs), or a file's content. Writes — create a branch, update a file (commit), create a pull request, post a PR review comment — require the user's approval first: call proposeConnectorAction with provider github, the exact action and exact payload, wait for the approved one-use token, then call this tool with that same payload and approvalToken. Writes without the matching token are rejected.",
    inputSchema: schema,
    execute: async (input) => {
      try {
        if (input.action === "list_repos") {
          const result = await callConnectorApi(
            userId,
            "github",
            "/user/repos",
            {
              query: {
                per_page: input.maxResults,
                sort: "updated",
                direction: "desc",
              },
            },
          );
          return {
            repositories: Array.isArray(result.items)
              ? result.items.slice(0, input.maxResults)
              : [],
          };
        }

        const [owner, repo] = input.repository.split("/");
        const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

        if (input.action === "get_issue") {
          return await callConnectorApi(
            userId,
            "github",
            `${base}/issues/${input.issueNumber}`,
          );
        }

        if (input.action === "list_issues" || input.action === "list_prs") {
          const path =
            input.action === "list_issues" ? `${base}/issues` : `${base}/pulls`;
          const result = await callConnectorApi(userId, "github", path, {
            query: {
              state: input.state,
              per_page: input.maxResults,
              sort: "updated",
              direction: "desc",
            },
          });
          return {
            [input.action === "list_issues" ? "issues" : "pullRequests"]:
              Array.isArray(result.items)
                ? result.items.slice(0, input.maxResults)
                : [],
          };
        }

        if (input.action === "get_pr") {
          const pr = await callConnectorApi(
            userId,
            "github",
            `${base}/pulls/${input.pullNumber}`,
          );
          return summarizePullRequest(pr);
        }

        if (input.action === "get_pr_files") {
          const result = await callConnectorApi(
            userId,
            "github",
            `${base}/pulls/${input.pullNumber}/files`,
            { query: { per_page: 30 } },
          );
          const files = Array.isArray(result)
            ? result.slice(0, 20)
            : Array.isArray(result.files)
              ? result.files.slice(0, 20)
              : [];
          return {
            files: files.map((file: Record<string, unknown>) => ({
              filename: file.filename,
              status: file.status,
              additions: file.additions,
              deletions: file.deletions,
              previousFilename: file.previous_filename ?? undefined,
              patch:
                typeof file.patch === "string" &&
                file.patch.length > MAX_PATCH_CHARS
                  ? `${file.patch.slice(0, MAX_PATCH_CHARS)}…[truncated]`
                  : file.patch,
            })),
          };
        }

        if (input.action === "get_file") {
          const result = await callConnectorApi(
            userId,
            "github",
            `${base}/contents/${encodeURI(input.path)}`,
            { query: input.ref ? { ref: input.ref } : {} },
          );
          if (Array.isArray(result)) {
            return {
              error:
                "Path is a directory; this tool reads single files only. Paths inside it can be read one by one.",
            };
          }
          const encoding = (result as Record<string, unknown>).encoding;
          const raw = (result as Record<string, unknown>).content;
          let text = "";
          if (typeof raw === "string" && encoding === "base64") {
            const decoded = Buffer.from(raw, "base64").toString("utf8");
            text =
              decoded.length > MAX_FILE_CHARS
                ? `${decoded.slice(0, MAX_FILE_CHARS)}…[truncated]`
                : decoded;
          } else if (typeof raw === "string") {
            text = raw.slice(0, MAX_FILE_CHARS);
          }
          return {
            path: (result as Record<string, unknown>).path,
            sha: (result as Record<string, unknown>).sha,
            size: (result as Record<string, unknown>).size,
            content: text,
            truncated: text.endsWith("…[truncated]"),
          };
        }

        if (input.action === "create_branch") {
          const payload = {
            repository: input.repository,
            branchName: input.branchName,
            fromSha: input.fromSha,
          };
          const approved = await connectorActionApprovalRepository.consume(
            userId,
            input.approvalToken,
            { provider: "github", action: "create_branch", payload },
          );
          if (!approved) throw rejectApproval();
          return await callConnectorApi(userId, "github", `${base}/git/refs`, {
            method: "POST",
            body: { ref: `refs/heads/${input.branchName}`, sha: input.fromSha },
          });
        }

        if (input.action === "update_file") {
          const payload = {
            repository: input.repository,
            path: input.path,
            branchName: input.branchName,
            fileSha: input.fileSha,
            commitMessage: input.commitMessage,
            fileContent: input.fileContent,
          };
          const approved = await connectorActionApprovalRepository.consume(
            userId,
            input.approvalToken,
            { provider: "github", action: "update_file", payload },
          );
          if (!approved) throw rejectApproval();
          return await callConnectorApi(
            userId,
            "github",
            `${base}/contents/${encodeURI(input.path)}`,
            {
              method: "PUT",
              body: {
                message: input.commitMessage,
                content: Buffer.from(input.fileContent, "utf8").toString(
                  "base64",
                ),
                sha: input.fileSha,
                branch: input.branchName,
              },
            },
          );
        }

        if (input.action === "create_pull_request") {
          const payload = {
            repository: input.repository,
            title: input.title,
            headRef: input.headRef,
            baseBranch: input.baseBranch,
            body: input.body ?? "",
          };
          const approved = await connectorActionApprovalRepository.consume(
            userId,
            input.approvalToken,
            { provider: "github", action: "create_pull_request", payload },
          );
          if (!approved) throw rejectApproval();
          const pr = await callConnectorApi(userId, "github", `${base}/pulls`, {
            method: "POST",
            body: {
              title: input.title,
              head: input.headRef,
              base: input.baseBranch,
              body: input.body ?? "",
            },
          });
          return summarizePullRequest(pr);
        }

        // create_pr_review
        const payload = {
          repository: input.repository,
          pullNumber: input.pullNumber,
          body: input.body,
        };
        const approved = await connectorActionApprovalRepository.consume(
          userId,
          input.approvalToken,
          { provider: "github", action: "create_pr_review", payload },
        );
        if (!approved) throw rejectApproval();
        return await callConnectorApi(
          userId,
          "github",
          `${base}/pulls/${input.pullNumber}/reviews`,
          {
            method: "POST",
            body: { body: input.body, event: "COMMENT" },
          },
        );
      } catch (error) {
        return {
          error:
            error instanceof ConnectorApiError
              ? error.message
              : "GitHub request failed",
        };
      }
    },
  });
}
