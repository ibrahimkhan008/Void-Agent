"use client";

import type { SeoSummary } from "lib/cockpit/seo";
import { CheckCircle2, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "ui/card";
import { Input } from "ui/input";

type Team = { id: string; name: string; role: "owner" | "editor" | "viewer" };
type Status = { connected: boolean; credentialSet: boolean; domain: string | null; canManage: boolean; lastTestedAt: string | null; lastTestOk: boolean | null };
const metric = (value: number | null) => value === null ? "—" : new Intl.NumberFormat().format(value);

export function SeoDashboard() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [summary, setSummary] = useState<SeoSummary | null>(null);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [domain, setDomain] = useState("");
  const [locationName, setLocationName] = useState("United States");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const canManage = !teamId || status?.canManage === true;

  const load = useCallback(async () => {
    setBusy(true); setError(null); setStatus(null); setSummary(null);
    try {
      const connection = await fetch(`/api/cockpit/seo/connection${query}`, { cache: "no-store" });
      const state = await connection.json();
      if (!connection.ok) throw new Error(state.error ?? "Could not load SEO connection.");
      setStatus(state as Status);
      if (state.connected) {
        setDomain(state.domain ?? "");
        const response = await fetch(`/api/cockpit/seo/summary${query}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load SEO report.");
        setSummary(data as SeoSummary);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load SEO data."); }
    finally { setBusy(false); }
  }, [query]);
  useEffect(() => { void fetch("/api/projects/teams", { cache: "no-store" }).then(async (r) => { if (r.ok) setTeams(((await r.json()) as { teams?: Team[] }).teams ?? []); }).catch(() => undefined); }, []);
  useEffect(() => { void load(); }, [load]);

  async function save() {
    setBusy(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/cockpit/seo/connection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teamId, config: { kind: "dataforseo", login, password, domain, locationName } }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save SEO connection.");
      setLogin(""); setPassword("");
      const test = await fetch("/api/cockpit/seo/connection/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teamId }) });
      const result = await test.json();
      if (!test.ok) throw new Error(result.error ?? "Saved, but provider test failed.");
      await load(); setNotice("DataForSEO connection saved and tested.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save SEO connection."); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm("Remove this DataForSEO connection?")) return;
    setBusy(true); setError(null);
    try { const response = await fetch(`/api/cockpit/seo/connection${query}`, { method: "DELETE" }); if (!response.ok) throw new Error("Could not remove SEO connection."); await load(); setNotice("SEO connection removed."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove SEO connection."); }
    finally { setBusy(false); }
  }

  return <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-muted-foreground">Cockpit / SEO</p><h1 className="mt-1 text-3xl font-semibold">Search performance</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Read-only DataForSEO domain overview, ranked keywords, and backlink totals. Credentials are encrypted at rest and never returned to the browser.</p></div>
      <nav aria-label="Cockpit providers" className="flex flex-wrap gap-2 text-sm"><Link className="rounded-md border px-3 py-2" href="/cockpit">Stripe</Link><Link className="rounded-md border px-3 py-2" href="/cockpit/vercel">Vercel</Link><Link className="rounded-md border px-3 py-2" href="/cockpit/website">Website</Link><Link className="rounded-md border px-3 py-2" href="/cockpit/revolut">Revolut</Link><Link className="rounded-md border px-3 py-2" href="/cockpit/superlog">Superlog</Link></nav></header>
    <label className="grid max-w-sm gap-2 text-sm font-medium">Connection scope<select className="h-10 rounded-md border bg-background px-3" value={teamId ?? "personal"} onChange={(e) => setTeamId(e.target.value === "personal" ? null : e.target.value)}><option value="personal">Personal</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name} ({team.role})</option>)}</select></label>
    <Card><CardHeader><CardTitle>DataForSEO connection</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">Enter your DataForSEO login and API password with a bare domain such as <code>example.com</code>. The dashboard sends domain-level read-only queries to the fixed DataForSEO MCP endpoint.</p>
      {canManage ? <div className="grid gap-3 sm:grid-cols-2"><Input aria-label="Domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" /><Input aria-label="Location" value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="United States" /><Input aria-label="DataForSEO login" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} placeholder={status?.credentialSet ? "Saved login; leave blank to keep" : "DataForSEO login"} /><Input aria-label="DataForSEO API password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={status?.credentialSet ? "Saved password; leave blank to keep" : "API password"} /><Button className="sm:col-span-2 sm:justify-self-start" disabled={busy || (!status?.credentialSet && (!login.trim() || !password.trim())) || !domain.trim()} onClick={() => void save()}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : "Save and test"}</Button></div> : <p className="text-sm text-muted-foreground">You can view this team connection. Only owners and editors can change it.</p>}
      <div className="flex flex-wrap items-center gap-3 text-sm"><span>{status?.connected ? `Connected${status.domain ? `: ${status.domain}` : ""}` : "Not connected"}</span>{status?.lastTestOk && <CheckCircle2 aria-label="Connection test passed" className="size-4 text-green-600" />}{status?.lastTestedAt && <span className="text-muted-foreground">Tested {new Date(status.lastTestedAt).toLocaleString()}</span>}<Button variant="outline" size="sm" disabled={busy} onClick={() => void load()}><RefreshCw className="mr-2 size-4" />Refresh</Button>{status?.connected && canManage && <Button variant="outline" size="sm" disabled={busy} onClick={() => void remove()}><Trash2 className="mr-2 size-4" />Remove</Button>}</div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    </CardContent></Card>
    {summary && <><section className="grid gap-3 sm:grid-cols-3">{[["Organic traffic", summary.organicTraffic], ["Ranking keywords", summary.keywordsCount], ["Referring domains", summary.referringDomains]].map(([label, value]) => <Card key={label as string}><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{label}</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{metric(value as number | null)}</CardContent></Card>)}</section><Card><CardHeader><CardTitle>Top ranked keywords</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-muted-foreground"><th className="py-2 pr-4">Keyword</th><th className="py-2 pr-4">Position</th><th className="py-2 pr-4">Previous</th><th className="py-2">Search volume</th></tr></thead><tbody>{summary.topKeywords.map((row) => <tr className="border-b last:border-0" key={row.keyword}><td className="py-2 pr-4">{row.keyword}</td><td className="py-2 pr-4">{metric(row.position)}</td><td className="py-2 pr-4">{metric(row.previousPosition)}</td><td className="py-2">{metric(row.volume)}</td></tr>)}{summary.topKeywords.length === 0 && <tr><td className="py-4 text-muted-foreground" colSpan={4}>No ranking keyword data returned.</td></tr>}</tbody></table></CardContent></Card></>}
  </main>;
}
