"use client";

import { Loader2 } from "lucide-react";
import React, { useEffect, useState } from "react";

type TeamChoice = { id: string; name: string };

const privateFetch = (url: string, init?: RequestInit) =>
  fetch(url, { ...init, cache: "no-store", credentials: "same-origin" });

function getErrorMessage(body: unknown, fallback: string): string {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }
  return fallback;
}

export function ActiveTeamSelector() {
  const [teams, setTeams] = useState<TeamChoice[]>([]);
  const [activeTeamId, setActiveTeamId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [teamsResponse, activeResponse] = await Promise.all([
          privateFetch("/api/projects/teams"),
          privateFetch("/api/user/active-team"),
        ]);
        const [teamsBody, activeBody] = await Promise.all([
          teamsResponse.json(),
          activeResponse.json(),
        ]);
        if (!teamsResponse.ok) {
          throw new Error(getErrorMessage(teamsBody, "Could not load teams."));
        }
        if (!activeResponse.ok) {
          throw new Error(
            getErrorMessage(activeBody, "Could not load the active team."),
          );
        }

        const nextTeams: TeamChoice[] = Array.isArray(teamsBody?.teams)
          ? teamsBody.teams.filter(
              (team: unknown): team is TeamChoice =>
                !!team &&
                typeof team === "object" &&
                "id" in team &&
                typeof team.id === "string" &&
                "name" in team &&
                typeof team.name === "string",
            )
          : [];
        const requestedActiveId =
          typeof activeBody?.activeTeamId === "string"
            ? activeBody.activeTeamId
            : "";
        const validActiveId = nextTeams.some(
          (team) => team.id === requestedActiveId,
        )
          ? requestedActiveId
          : "";

        if (cancelled) return;
        setTeams(nextTeams);
        setActiveTeamId(validActiveId);
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load team context.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateActiveTeam = async (teamId: string) => {
    if (saving || teamId === activeTeamId) return;
    setSaving(true);
    setError("");
    setStatus("");
    try {
      const response = await privateFetch("/api/user/active-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: teamId || null }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(
          getErrorMessage(body, "Could not update the active team."),
        );
      }
      setActiveTeamId(teamId);
      setStatus("Team context updated for usage metering.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not update the active team.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-labelledby="active-team-heading"
      className="max-w-4xl space-y-3 rounded-xl border bg-card p-5"
      data-testid="active-team-selector"
    >
      <div className="space-y-1">
        <h2 id="active-team-heading" className="text-lg font-semibold">
          Active team context
        </h2>
        <p className="text-sm text-muted-foreground">
          This selection sets the team context used for usage metering only. It
          does not grant team access or change permissions; team actions still
          check your membership and role.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {status && (
        <p role="status" className="text-sm">
          {status}
        </p>
      )}

      {loading ? (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" />
          Loading team context...
        </p>
      ) : (
        <label className="block max-w-xl space-y-2 text-sm font-medium">
          <span>Team used for metering</span>
          <select
            aria-label="Team used for metering"
            className="h-10 w-full rounded-md border bg-background px-3"
            value={activeTeamId}
            disabled={saving || teams.length === 0}
            onChange={(event) => void updateActiveTeam(event.target.value)}
          >
            <option value="">Personal / no team</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {saving && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" />
          Updating team context...
        </p>
      )}
      {!loading && teams.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">
          You are not a member of any team. Personal metering is selected.
        </p>
      )}
    </section>
  );
}
