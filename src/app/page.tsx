"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);

type Decision = { at: string; action: string; reasoning: string; chargebackRisk: number; expectedLoss: number; actionCost: number; guardrails: string[]; paypal: string[]; status: string; message?: string };
type Sub = { id: string; name: string; email: string; plan: string; monthsSubscribed: number; lastActiveDays: number; skippedShipments: number; emailsUnopened: number; renewalInDays: number; lastChargeDaysAgo: number | null; supportMessage?: string; status: string; paypal: Record<string, any>; decisions: Decision[]; risk: number };
type Dispute = { id: string; subscriberId: string; reason: string; amount: number; buyerNote: string; facts: Record<string, any>; status: string; decision?: Decision; evidence?: string[] };
type State = { merchant: string; subscribers: Sub[]; disputes: Dispute[]; saved: { preventedChargebacks: number; dollarsSaved: number; refundsIssued: number }; injectionBlocks: { at: string; subscriberId: string; excerpt: string }[]; apiCalls: { at: string; method: string; path: string; status: number; ok: boolean; summary: string }[] };

const ACTION_LABEL: Record<string, string> = { remind: "Reminder sent", pause: "Paused", downgrade: "Downgraded", refund: "Refunded", escalate: "Escalated", no_action: "No action", accept_dispute: "Accepted", contest_dispute: "Contested" };
const STATUS_TONE: Record<string, string> = { executed: "bg-emerald-50 text-emerald-700 ring-emerald-200", awaiting_approval: "bg-amber-50 text-amber-700 ring-amber-200", blocked: "bg-rose-50 text-rose-700 ring-rose-200", simulated: "bg-slate-100 text-slate-600 ring-slate-200" };
const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const theme = themeQuartz.withParams({ fontFamily: "inherit", headerFontWeight: 600, accentColor: "#0b5fff", rowHeight: 46, headerHeight: 42, borderRadius: 10, wrapperBorderRadius: 14 });

function signals(x: Sub) {
  const s: string[] = [];
  if (x.lastActiveDays >= 20) s.push(`inactive ${x.lastActiveDays}d`);
  if (x.emailsUnopened >= 2) s.push(`${x.emailsUnopened} emails unopened`);
  if (x.skippedShipments) s.push(`skipped ${x.skippedShipments}`);
  if (x.renewalInDays <= 3) s.push(`renews in ${x.renewalInDays}d`);
  if (x.lastChargeDaysAgo !== null && x.lastChargeDaysAgo <= 3) s.push(`charged ${x.lastChargeDaysAgo}d ago`);
  if (x.supportMessage) s.push("message");
  return s.join(" · ") || "—";
}

export default function Home() {
  const [st, setSt] = useState<State | null>(null);
  const [tab, setTab] = useState<"subs" | "disputes" | "log">("subs");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => setSt(await (await fetch("/api/state", { cache: "no-store" })).json()), []);
  useEffect(() => { fetch("/api/state", { cache: "no-store" }).then(r => r.json()).then(setSt); }, []);

  const post = async (url: string, body: object, key: string) => {
    setBusy(b => ({ ...b, [key]: true })); setErr(null);
    try { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) setErr(j.error ?? "Something went wrong"); }
    finally { setBusy(b => ({ ...b, [key]: false })); await refresh(); }
  };
  const runAtRisk = async () => {
    if (!st) return;
    for (const x of st.subscribers.filter(z => z.risk >= 0.5 && !z.decisions.length)) await post("/api/agent", { subscriberId: x.id }, x.id);
  };

  const cols = useMemo<ColDef<Sub>[]>(() => [
    { field: "name", headerName: "Subscriber", flex: 1.3, minWidth: 160, cellRenderer: (p: any) => <span className="font-medium text-slate-900">{p.value}</span> },
    { field: "plan", width: 90 },
    { field: "risk", headerName: "Risk", width: 140, sort: "desc", cellRenderer: (p: any) => <div className="flex items-center gap-2 h-full"><div className="h-1.5 w-16 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full ${p.value >= 0.6 ? "bg-rose-500" : p.value >= 0.35 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${p.value * 100}%` }} /></div><span className="tabular-nums text-slate-600">{Math.round(p.value * 100)}</span></div> },
    { headerName: "Signals", flex: 2, minWidth: 220, valueGetter: (p) => signals(p.data!), cellClass: "text-slate-500" },
    { field: "renewalInDays", headerName: "Renews", width: 100, valueFormatter: (p) => `in ${p.value}d` },
    { headerName: "Agent decision", flex: 1.2, minWidth: 170, valueGetter: (p) => p.data!.decisions[0]?.action ?? "", cellRenderer: (p: any) => { const d: Decision | undefined = p.data.decisions[0]; return d ? <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${STATUS_TONE[d.status]}`}>{ACTION_LABEL[d.action]}{d.status === "awaiting_approval" ? " · needs approval" : ""}</span> : <span className="text-slate-300">—</span>; } },
    { headerName: "", width: 120, sortable: false, cellRenderer: (p: any) => <button onClick={(e) => { e.stopPropagation(); post("/api/agent", { subscriberId: p.data.id }, p.data.id); }} disabled={busy[p.data.id]} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-40">{busy[p.data.id] ? "Thinking…" : "Run agent"}</button> },
  ], [busy]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!st) return <div className="p-10 text-slate-400">Loading…</div>;
  const atRisk = st.subscribers.filter(x => x.risk >= 0.5 && !x.decisions.length).length;
  const sel = st.subscribers.find(x => x.id === open);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-3">
          <div className="flex items-center gap-2"><div className="grid h-8 w-8 place-items-center rounded-lg bg-[#0b5fff] text-white font-bold">S</div><span className="text-lg font-semibold tracking-tight">SubGuard</span></div>
          <span className="text-sm text-slate-400">for</span><span className="text-sm font-medium">{st.merchant} · coffee subscriptions</span>
          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">PayPal Sandbox</span>
          <div className="ml-auto flex gap-2">
            <Link href="/setup" className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">Sandbox setup</Link>
            <button onClick={() => post("/api/reset", {}, "reset")} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">Reset demo</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        <p className="mb-5 max-w-3xl text-sm text-slate-500">40% of US card disputes are &ldquo;cancelled recurring transaction&rdquo; (CFPB). SubGuard watches every subscriber and acts <b className="text-slate-700">before</b> a forgotten renewal becomes a chargeback — then fights the disputes worth fighting.</p>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[["Active subscribers", st.subscribers.filter(x => x.status === "active").length.toString(), ""], ["At risk, not handled", atRisk.toString(), "text-rose-600"], ["Chargebacks prevented", st.saved.preventedChargebacks.toString(), "text-emerald-600"], ["Net loss avoided", money(st.saved.dollarsSaved), "text-emerald-600"], ["Injection attempts blocked", st.injectionBlocks.length.toString(), "text-violet-600"]].map(([k, v, c]) => (
            <div key={k} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-xs font-medium text-slate-500">{k}</div><div className={`mt-1 text-2xl font-semibold tabular-nums ${c}`}>{v}</div></div>
          ))}
        </section>

        <div className="mt-6 flex items-center gap-1 border-b border-slate-200">
          {([["subs", "Subscribers"], ["disputes", `Disputes (${st.disputes.filter(d => d.status === "open").length} open)`], ["log", "Agent log & guardrails"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === k ? "border-[#0b5fff] text-[#0b5fff]" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{l}</button>
          ))}
          {tab === "subs" && <button onClick={runAtRisk} className="ml-auto mb-1 rounded-lg bg-[#0b5fff] px-3.5 py-1.5 text-sm font-medium text-white hover:bg-blue-700">Run agent on all at-risk</button>}
        </div>
        {err && <div className="mt-3 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{err}</div>}

        {tab === "subs" && (
          <div className="mt-4 h-[620px]">
            <AgGridReact<Sub> theme={theme} rowData={st.subscribers} columnDefs={cols} getRowId={(p) => p.data.id} onRowClicked={(e) => setOpen(e.data!.id)} rowClass="cursor-pointer" />
          </div>
        )}

        {tab === "disputes" && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {st.disputes.map(dp => { const x = st.subscribers.find(s => s.id === dp.subscriberId)!; return (
              <div key={dp.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-start justify-between"><div><div className="text-xs font-medium text-slate-400">{dp.id} · {dp.reason.replaceAll("_", " ").toLowerCase()}</div><div className="mt-1 text-lg font-semibold">{x.name} · {money(dp.amount)}</div></div>
                  {dp.status === "open" ? <button onClick={() => post("/api/dispute", { disputeId: dp.id }, dp.id)} disabled={busy[dp.id]} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">{busy[dp.id] ? "Thinking…" : "Ask agent"}</button> : <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${dp.status === "contested" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>{dp.status}</span>}</div>
                <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm italic text-slate-600">&ldquo;{dp.buyerNote}&rdquo;</p>
                <ul className="mt-3 grid grid-cols-2 gap-1 text-xs text-slate-500"><li>Delivered boxes: {dp.facts.deliveredShipments}</li><li>Last login: {dp.facts.lastLoginDaysAgo}d ago</li><li>Tracking delivered: {String(dp.facts.trackingDelivered)}</li><li>Reminder before renewal: {String(dp.facts.reminderSentBeforeRenewal)}</li></ul>
                {dp.decision && <div className="mt-4 border-t border-slate-100 pt-3 text-sm"><div className="font-medium">{ACTION_LABEL[dp.decision.action]}</div><p className="mt-1 text-slate-600">{dp.decision.reasoning}</p>
                  {!!dp.evidence?.length && <><div className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Evidence pack</div><ul className="mt-1 list-disc pl-5 text-slate-600">{dp.evidence.map(e => <li key={e}>{e}</li>)}</ul></>}
                  <p className="mt-3 text-xs text-slate-400">{dp.decision.guardrails[0]}</p></div>}
              </div>); })}
          </div>
        )}

        {tab === "log" && (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-semibold">PayPal API calls</h3><p className="text-xs text-slate-400">Real sandbox requests made by the agent and setup</p>
              <div className="mt-3 max-h-[480px] overflow-auto font-mono text-xs">{st.apiCalls.length ? st.apiCalls.map((c, i) => <div key={i} className="flex gap-2 border-b border-slate-50 py-1.5"><span className={c.ok ? "text-emerald-600" : "text-rose-600"}>{c.status}</span><span className="w-12 text-slate-400">{c.method}</span><span className="flex-1 text-slate-700">{c.path}</span><span className="text-slate-400">{c.summary}</span></div>) : <div className="text-slate-400">No calls yet.</div>}</div></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-semibold">Guardrails</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-600"><li>• Refunds never exceed the original PayPal capture, which is re-fetched before every refund.</li><li>• Daily refund cap of $100; refunds above $30 wait for a human click.</li><li>• Every money-moving call carries a PayPal-Request-Id (idempotent — no double refunds).</li><li>• Customer text is wrapped as untrusted data; injection patterns are detected and logged.</li></ul>
              <h4 className="mt-5 text-sm font-semibold">Blocked injection attempts</h4>{st.injectionBlocks.length ? st.injectionBlocks.map((b, i) => <div key={i} className="mt-2 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-800">{st.subscribers.find(s => s.id === b.subscriberId)?.name}: &ldquo;{b.excerpt}…&rdquo;</div>) : <p className="mt-2 text-xs text-slate-400">None yet.</p>}</div>
          </div>
        )}
      </main>

      {sel && (
        <div className="fixed inset-0 z-30 flex justify-end bg-slate-900/30" onClick={() => setOpen(null)}>
          <aside className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between"><div><h2 className="text-xl font-semibold">{sel.name}</h2><p className="text-sm text-slate-500">{sel.plan} · {sel.monthsSubscribed} months · {sel.status}</p></div><button onClick={() => setOpen(null)} className="text-slate-400 hover:text-slate-700">✕</button></div>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm"><div className="rounded-lg bg-slate-50 p-2.5"><dt className="text-xs text-slate-400">Last active</dt><dd>{sel.lastActiveDays} days ago</dd></div><div className="rounded-lg bg-slate-50 p-2.5"><dt className="text-xs text-slate-400">Next renewal</dt><dd>in {sel.renewalInDays} days</dd></div><div className="rounded-lg bg-slate-50 p-2.5"><dt className="text-xs text-slate-400">PayPal subscription</dt><dd className="truncate">{sel.paypal.subscriptionId ? `${sel.paypal.subscriptionId} · ${sel.paypal.subscriptionStatus}` : "—"}</dd></div><div className="rounded-lg bg-slate-50 p-2.5"><dt className="text-xs text-slate-400">Latest capture</dt><dd className="truncate">{sel.paypal.captureId ? `${sel.paypal.captureId}${sel.paypal.refunded ? " · refunded" : ""}` : "—"}</dd></div></dl>
            {sel.supportMessage && <div className="mt-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Customer message</div><p className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm italic">&ldquo;{sel.supportMessage}&rdquo;</p></div>}
            <button onClick={() => post("/api/agent", { subscriberId: sel.id }, sel.id)} disabled={busy[sel.id]} className="mt-5 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-medium text-white disabled:opacity-40">{busy[sel.id] ? "Agent is thinking…" : "Run agent"}</button>
            {sel.decisions.map((d, i) => (
              <div key={i} className="mt-5 rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between"><span className="font-semibold">{ACTION_LABEL[d.action]}</span><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${STATUS_TONE[d.status]}`}>{d.status.replace("_", " ")}</span></div>
                <p className="mt-2 text-sm text-slate-600">{d.reasoning}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-lg bg-slate-50 p-2"><div className="text-slate-400">Chargeback risk</div><div className="text-base font-semibold">{Math.round(d.chargebackRisk * 100)}%</div></div><div className="rounded-lg bg-slate-50 p-2"><div className="text-slate-400">Loss if nothing</div><div className="text-base font-semibold">{money(d.expectedLoss)}</div></div><div className="rounded-lg bg-slate-50 p-2"><div className="text-slate-400">Action cost</div><div className="text-base font-semibold">{money(d.actionCost)}</div></div></div>
                {d.message && <div className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900"><span className="text-xs font-semibold">Message to customer: </span>{d.message}</div>}
                <ul className="mt-3 space-y-1 text-xs text-slate-500">{d.guardrails.map(g => <li key={g}>✓ {g}</li>)}</ul>
                {!!d.paypal.length && <div className="mt-2 font-mono text-[11px] text-emerald-700">{d.paypal.map(c => <div key={c}>{c}</div>)}</div>}
                {d.status === "awaiting_approval" && d.action === "refund" && <button onClick={() => post("/api/approve", { subscriberId: sel.id }, "ap" + sel.id)} className="mt-3 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white">Approve refund</button>}
              </div>
            ))}
          </aside>
        </div>
      )}
    </div>
  );
}
