"use client";

import type { VercelProjectSnapshot, VercelSnapshot } from "lib/cockpit/vercel";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  Trash2,
  Triangle,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "ui/card";
import { Input } from "ui/input";
import { Textarea } from "ui/textarea";

type TeamChoice = {
  id: string;
  name: string;
  role: "owner" | "editor" | "viewer";
};
type ProjectConfig = { key: string; projectId: string; label: string };
type ConnectionStatus = {
  connected: boolean;
  config: {
    teamId: string;
    projects: ProjectConfig[];
    tokenSet: boolean;
  } | null;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  updatedAt: string | null;
  canManage: boolean;
};

function parseProjectLines(value: string): ProjectConfig[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const eq = line.indexOf("=");
      const label = (eq < 0 ? line : line.slice(0, eq)).trim().slice(0, 32);
      const projectId = (eq < 0 ? line : line.slice(eq + 1))
        .trim()
        .slice(0, 100);
      const key =
        label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 32) || "project";
      return { key, label, projectId };
    });
}

function projectLines(projects?: ProjectConfig[]) {
  return (projects ?? [])
    .map((project) => `${project.label} = ${project.projectId}`)
    .join("\n");
}

const statusLabel = (project: VercelProjectSnapshot) =>
  project.deploy?.state ??
  (project.error ? "Unavailable" : "No production deployment");

export function VercelDashboard() {
  const [teams, setTeams] = useState<TeamChoice[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [snapshot, setSnapshot] = useState<VercelSnapshot | null>(null);
  const [token, setToken] = useState("");
  const [vercelTeam, setVercelTeam] = useState("");
  const [projectsText, setProjectsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const scopeQuery = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const canManage = !teamId || connection?.canManage === true;

  useEffect(() => {
    void fetch("/api/projects/teams", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { teams?: TeamChoice[] };
        setTeams(body.teams ?? []);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    setBusy(true);
    setConnection(null);
    setSnapshot(null);
    void (async () => {
      try {
        const response = await fetch(
          `/api/cockpit/vercel/connection${scopeQuery}`,
          { cache: "no-store" },
        );
        const data = (await response.json()) as ConnectionStatus & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(data.error ?? "Could not load Vercel connection.");
        if (!active) return;
        setConnection(data);
        setToken("");
        setVercelTeam(data.config?.teamId ?? "");
        setProjectsText(projectLines(data.config?.projects));
        if (data.connected) {
          const feed = await fetch(
            `/api/cockpit/vercel/deployments${scopeQuery}`,
            { cache: "no-store" },
          );
          const body = (await feed.json()) as VercelSnapshot & {
            error?: string;
          };
          if (!feed.ok)
            throw new Error(body.error ?? "Could not load deployment data.");
          if (active) setSnapshot(body);
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "Could not load Vercel data.",
          );
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [scopeQuery]);

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/cockpit/vercel/deployments${scopeQuery}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as VercelSnapshot & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error ?? "Could not load deployment data.");
      setSnapshot(body);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load deployment data.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/cockpit/vercel/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          config: {
            token,
            teamId: vercelTeam,
            projects: parseProjectLines(projectsText),
          },
        }),
      });
      const body = (await response.json()) as ConnectionStatus & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error ?? "Could not save Vercel connection.");
      setConnection(body);
      setToken("");
      setNotice(
        "Encrypted Vercel connection saved. Test it to verify project access.",
      );
      setSnapshot(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save Vercel connection.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/cockpit/vercel/connection/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok)
        throw new Error(
          body.error ??
            "Vercel did not confirm access to the configured project.",
        );
      setNotice("Vercel connection verified.");
      const status = await fetch(
        `/api/cockpit/vercel/connection${scopeQuery}`,
        { cache: "no-store" },
      );
      if (status.ok) setConnection((await status.json()) as ConnectionStatus);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vercel test failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/cockpit/vercel/connection${scopeQuery}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Could not remove Vercel connection.");
      setConnection({
        connected: false,
        config: null,
        lastTestedAt: null,
        lastTestOk: null,
        updatedAt: null,
        canManage: true,
      });
      setSnapshot(null);
      setProjectsText("");
      setVercelTeam("");
      setNotice("Vercel connection removed.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not remove Vercel connection.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Triangle className="size-4" /> Cockpit / Deployments
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Vercel deployments
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Production deployment status and recent failures for selected Vercel
            projects. This connection only reads data.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/cockpit/stripe">Stripe finance</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/cockpit/website">Website analytics</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/cockpit/revolut">Revolut Business</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/cockpit/superlog">Superlog incidents</Link>
          </Button>
          {connection?.connected && (
            <Button
              variant="outline"
              onClick={() => void refresh()}
              disabled={busy}
            >
              <RefreshCw className="size-4" />
              Refresh
            </Button>
          )}
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="vercel-scope" className="text-sm font-medium">
          Connection scope
        </label>
        <select
          id="vercel-scope"
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={teamId ?? "personal"}
          onChange={(event) => {
            setTeamId(
              event.target.value === "personal" ? null : event.target.value,
            );
            setError(null);
            setNotice(null);
          }}
        >
          <option value="personal">Personal</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
              {team.role === "viewer" ? " · view only" : ""}
            </option>
          ))}
        </select>
        {teamId && connection && !connection.canManage && (
          <span className="text-sm text-muted-foreground">
            Team members can view; owners and editors manage this connection.
          </span>
        )}
      </div>
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-300"
        >
          <CheckCircle2 className="size-4" />
          {notice}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Vercel connection</CardTitle>
          <CardDescription>
            The token and complete project configuration are encrypted at rest.
            Use a read-only Vercel token. Leave the token blank when editing to
            keep the saved token.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {connection?.connected && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <span className="flex items-center gap-2 text-sm">
                {connection.lastTestOk ? (
                  <CheckCircle2 className="size-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="size-4 text-amber-600" />
                )}
                Connection saved ·{" "}
                {connection.lastTestedAt
                  ? connection.lastTestOk
                    ? "verified"
                    : "test failed"
                  : "not tested"}
              </span>
              {connection.canManage && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void test()}
                    disabled={busy}
                  >
                    {busy && <LoaderCircle className="size-4 animate-spin" />}
                    Test access
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => void remove()}
                    disabled={busy}
                  >
                    <Trash2 className="size-4" />
                    Remove
                  </Button>
                </div>
              )}
            </div>
          )}
          {canManage && (
            <>
              <label className="grid gap-2 text-sm font-medium">
                Vercel API token
                <Input
                  type="password"
                  autoComplete="new-password"
                  maxLength={10_000}
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder={
                    connection?.connected
                      ? "Blank keeps the saved token"
                      : "Paste a read-only Vercel token"
                  }
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Vercel team ID or slug (optional)
                <Input
                  maxLength={100}
                  value={vercelTeam}
                  onChange={(event) => setVercelTeam(event.target.value)}
                  placeholder="team_... or team slug; leave blank to discover"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Projects
                <Textarea
                  value={projectsText}
                  onChange={(event) => setProjectsText(event.target.value)}
                  placeholder={"NAVIGATOR = prj_123\nWebsite = prj_456"}
                  rows={5}
                  maxLength={2_000}
                />
                <span className="text-xs font-normal text-muted-foreground">
                  One project per line: LABEL = PROJECT_ID. Add 1–6 projects.
                </span>
              </label>
              <Button
                onClick={() => void save()}
                disabled={
                  busy ||
                  !projectsText.trim() ||
                  (!connection?.connected && !token.trim())
                }
              >
                {busy && <LoaderCircle className="size-4 animate-spin" />}
                {connection?.connected
                  ? "Save configuration"
                  : "Connect Vercel"}
              </Button>
            </>
          )}
          <p className="text-xs text-muted-foreground">
            No deploy, promote, cancel, or project mutation endpoint is used.
            Spend and margin are not included because the reference has no cost
            source.
          </p>
        </CardContent>
      </Card>

      {busy && !snapshot && (
        <div className="flex items-center gap-2 py-8 text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Loading deployments…
        </div>
      )}
      {snapshot && (
        <section
          aria-label="Vercel project deployment status"
          className="space-y-3"
        >
          <h2 className="text-xl font-semibold">Projects</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {snapshot.projects.map((project) => (
              <ProjectCard key={project.key} project={project} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Updated {new Date(snapshot.generatedAt).toLocaleString()}
          </p>
        </section>
      )}
    </main>
  );
}

function ProjectCard({ project }: { project: VercelProjectSnapshot }) {
  const deploy = project.deploy;
  const color =
    deploy?.state === "READY"
      ? "text-emerald-600"
      : deploy?.state === "ERROR" || project.error
        ? "text-destructive"
        : "text-amber-600";
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>{project.label}</CardTitle>
            <CardDescription>{project.key}</CardDescription>
          </div>
          <span className={`text-sm font-semibold ${color}`}>
            {statusLabel(project)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {deploy ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>Latest production deploy</span>
              <time dateTime={deploy.createdAt}>
                {new Date(deploy.createdAt).toLocaleString()}
              </time>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>Failed in last 7 days</span>
              <span
                className={
                  deploy.failedLast7d
                    ? "text-destructive"
                    : "text-muted-foreground"
                }
              >
                {deploy.failedLast7d}
              </span>
            </div>
            {deploy.url && (
              <a
                className="inline-flex items-center gap-1 text-sm underline underline-offset-4"
                href={deploy.url}
                target="_blank"
                rel="noreferrer"
              >
                Open deployment <ExternalLink className="size-3" />
              </a>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {project.error
              ? "Could not read this project. Check the token and configured Vercel team scope."
              : "No production deployment was found."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
