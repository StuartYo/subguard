"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);
import EVAL from "@/data/eval-results.json";

type Decision = { investigation?: string[]; at: string; action: string; reasoning: string; chargebackRisk: number; expectedLoss: number; actionCost: number; guardrails: string[]; paypal: string[]; status: string; message?: string };
type Sub = { id: string; name: string; email: string; plan: string; monthsSubscribed: number; lastActiveDays: number; skippedShipments: number; emailsUnopened: number; renewalInDays: number; lastChargeDaysAgo: number | null; supportMessage?: string; status: string; paypal: Record<string, any>; decisions: Decision[]; risk: number };
type Dispute = { realId?: string; paypalStatus?: string; id: string; subscriberId: string; reason: string; amount: number; buyerNote: string; facts: Record<string, any>; status: string; decision?: Decision; evidence?: string[] };
type State = { exposure: { before: number; after: number }; merchant: string; subscribers: Sub[]; disputes: Dispute[]; saved: { preventedChargebacks: number; dollarsSaved: number; refundsIssued: number }; injectionBlocks: { at: string; subscriberId: string; excerpt: string }[]; apiCalls: { at: string; method: string; path: string; status: number; ok: boolean; summary: string }[]; autopilot?: { at: string; eventType: string; eventId: string; resourceId: string; subscriberId?: string; outcome: string }[] };

const ACTION_LABEL: Record<string, string> = { remind: "Reminder sent", pause: "Paused", downgrade: "Downgraded", refund: "Refunded", escalate: "Escalated", no_action: "No action", accept_dispute: "Accepted", contest_dispute: "Contested" };
const STATUS_TONE: Record<string, string> = { executed: "bg-emerald-50 text-emerald-700 ring-emerald-200", awaiting_approval: "bg-amber-50 text-amber-700 ring-amber-200", blocked: "bg-rose-50 text-rose-700 ring-rose-200", simulated: "bg-slate-100 text-slate-600 ring-slate-200" };
const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const theme = themeQuartz.withParams({ fontFamily: "inherit", fontSize: 15, headerFontWeight: 600, accentColor: "#0b5fff", rowHeight: 50, headerHeight: 44, borderRadius: 10, wrapperBorderRadius: 14 });

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
  const [tab, setTab] = useState<"subs" | "disputes" | "log" | "eval">("subs");
  const [calc, setCalc] = useState({ subs: 2000, price: 20, rate: 0.6 });
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);
  const [quick, setQuick] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [events, setEvents] = useState<{ id: string; type: string; at: string; summary: string; resource?: string }[] | null>(null);
  const grid = useRef<AgGridReact<Sub>>(null);

  const refresh = useCallback(async () => setSt(await (await fetch("/api/state", { cache: "no-store" })).json()), []);
  useEffect(() => { fetch("/api/state", { cache: "no-store" }).then(r => r.json()).then(setSt); }, []);
  useEffect(() => { if (tab !== "log") return; const t = setInterval(refresh, 5000); return () => clearInterval(t); }, [tab, refresh]);   // autopilot entries show up live

  const post = async (url: string, body: object, key: string) => {
    setBusy(b => ({ ...b, [key]: true })); setErr(null);
    try { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) setErr(j.error ?? "Something went wrong"); }
    finally { setBusy(b => ({ ...b, [key]: false })); await refresh(); }
  };
  const runSelected = async () => { for (const id of selected) await post("/api/agent", { subscriberId: id }, id); };
  const loadEvents = async () => setEvents((await (await fetch("/api/events", { cache: "no-store" })).json()).events);
  const runAtRisk = async () => {
    if (!st) return;
    for (const x of st.subscribers.filter(z => z.risk >= 0.5 && !z.decisions.length)) await post("/api/agent", { subscriberId: x.id }, x.id);
  };

  const cols = useMemo<ColDef<Sub>[]>(() => [
    { field: "name", headerName: "Subscriber", pinned: "left", filter: "agTextColumnFilter", flex: 1.3, minWidth: 170, cellRenderer: (p: any) => <span className="font-medium text-slate-900">{p.value}</span> },
    { field: "plan", width: 95, filter: "agTextColumnFilter" },
    { headerName: "Data", width: 120, valueGetter: (p) => (p.data!.paypal.subscriptionId || p.data!.paypal.captureId) ? "PayPal live" : "demo profile", cellRenderer: (p: any) => p.value === "PayPal live" ? <span className="rounded-full bg-[#0b5fff]/10 px-2 py-0.5 text-xs font-semibold text-[#0b5fff]">PayPal live</span> : <span className="text-xs text-slate-400">demo profile</span> },
    { field: "status", width: 110, filter: "agTextColumnFilter", cellRenderer: (p: any) => <span className="capitalize text-slate-600">{p.value}</span> },
    { field: "risk", headerName: "Risk", width: 150, sort: "desc", filter: "agNumberColumnFilter", cellRenderer: (p: any) => <div className="flex items-center gap-2 h-full"><div className="h-1.5 w-16 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full ${p.value >= 0.6 ? "bg-rose-500" : p.value >= 0.35 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${p.value * 100}%` }} /></div><span className="tabular-nums text-slate-600">{Math.round(p.value * 100)}</span></div> },
    { headerName: "Signals", flex: 2, minWidth: 170, valueGetter: (p) => signals(p.data!), cellClass: "text-slate-500" },
    { field: "renewalInDays", headerName: "Renews", width: 120, filter: "agNumberColumnFilter", valueFormatter: (p) => `in ${p.value}d` },
    { headerName: "Agent decision", flex: 1.2, minWidth: 150, valueGetter: (p) => p.data!.decisions[0]?.action ?? "", cellRenderer: (p: any) => { const d: Decision | undefined = p.data.decisions[0]; return d ? <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${STATUS_TONE[d.status]}`}>{ACTION_LABEL[d.action]}{d.status === "awaiting_approval" ? " · needs approval" : ""}</span> : <span className="text-slate-300">—</span>; } },
    { headerName: "", width: 112, sortable: false, pinned: "right", cellRenderer: (p: any) => <button onClick={(e) => { e.stopPropagation(); post("/api/agent", { subscriberId: p.data.id }, p.data.id); }} disabled={busy[p.data.id]} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-40">{busy[p.data.id] ? "Thinking…" : "Run agent"}</button> },
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

        <section className="mb-4 overflow-hidden rounded-2xl bg-gradient-to-r from-[#0b1f4d] to-[#0b5fff] p-5 text-white">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><div className="text-xs font-semibold uppercase tracking-widest text-blue-100">Expected chargeback exposure (model estimate)</div>
              <div className="mt-1 flex items-baseline gap-3"><span className="text-3xl font-semibold tabular-nums line-through decoration-2 opacity-60">{money(st.exposure.before)}</span><span className="text-xl">→</span><span className="text-4xl font-bold tabular-nums">{money(st.exposure.after)}</span></div>
              <div className="mt-1 text-sm text-blue-100">Risk-weighted (charge + $15 fee) across {st.subscribers.length} subscribers, before vs. after SubGuard acted.</div></div>
            <div className="w-full max-w-sm"><div className="flex justify-between text-xs text-blue-100"><span>Exposure removed</span><span className="tabular-nums">{st.exposure.before ? Math.round((1 - st.exposure.after / st.exposure.before) * 100) : 0}%</span></div>
              <div className="mt-1 h-2.5 rounded-full bg-white/20"><div className="h-full rounded-full bg-emerald-300 transition-all" style={{ width: `${st.exposure.before ? (1 - st.exposure.after / st.exposure.before) * 100 : 0}%` }} /></div></div>
          </div>
        </section>
        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[["Active subscribers", st.subscribers.filter(x => x.status === "active").length.toString(), ""], ["At risk, not handled", atRisk.toString(), "text-rose-600"], ["Chargebacks prevented", st.saved.preventedChargebacks.toString(), "text-emerald-600"], ["Net loss avoided", money(st.saved.dollarsSaved), "text-emerald-600"], ["Injection attempts blocked", st.injectionBlocks.length.toString(), "text-violet-600"]].map(([k, v, c]) => (
            <div key={k} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-xs font-medium text-slate-500">{k}</div><div className={`mt-1 text-2xl font-semibold tabular-nums ${c}`}>{v}</div></div>
          ))}
        </section>

        <div className="mt-6 flex items-center gap-1 border-b border-slate-200">
          {([["subs", "Subscribers"], ["disputes", `Disputes (${st.disputes.filter(d => d.status === "open").length} open)`], ["log", "Agent log & guardrails"], ["eval", "Evaluation"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === k ? "border-[#0b5fff] text-[#0b5fff]" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{l}</button>
          ))}
          {tab === "subs" && <button onClick={runAtRisk} className="ml-auto mb-1 rounded-lg bg-[#0b5fff] px-3.5 py-1.5 text-sm font-medium text-white hover:bg-blue-700">Run agent on all at-risk</button>}
        </div>
        {err && <div className="mt-3 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{err}</div>}

        {tab === "subs" && (<>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input value={quick} onChange={e => setQuick(e.target.value)} placeholder="Search subscribers, signals, decisions…" className="w-72 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-[#0b5fff]" />
            <button onClick={runSelected} disabled={!selected.length} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-40">Run agent on selected ({selected.length})</button>
            <button onClick={() => grid.current?.api.exportDataAsCsv({ fileName: "subguard-subscribers.csv" })} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium">Export CSV</button>
            <span className="ml-auto text-xs text-slate-400">Click a row for the agent&apos;s reasoning · use column menus to filter</span>
          </div>
          <div className="mt-3 h-[620px]">
            <AgGridReact<Sub> ref={grid} theme={theme} rowData={st.subscribers} columnDefs={cols} getRowId={(p) => p.data.id} quickFilterText={quick}
              rowSelection={{ mode: "multiRow", checkboxes: true, headerCheckbox: true, enableClickSelection: false }} onSelectionChanged={(e) => setSelected(e.api.getSelectedRows().map(r => r.id))}
              defaultColDef={{ sortable: true, resizable: true, floatingFilter: false }} onRowClicked={(e) => setOpen(e.data!.id)} rowClass="cursor-pointer"
              rowClassRules={{ "!bg-rose-50/40": (p) => (p.data?.risk ?? 0) >= 0.6 && !p.data?.decisions.length }} />
          </div>
        </>)}

        {tab === "disputes" && (<>
          <div className="mt-4 flex items-center gap-2"><button onClick={() => post("/api/disputes/sync", {}, "sync")} disabled={busy.sync} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-40">{busy.sync ? "Syncing…" : "Sync disputes from PayPal"}</button><span className="text-xs text-slate-400">Live disputes are opened by the sandbox buyer in PayPal and handled through the Disputes API.</span></div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {st.disputes.map(dp => { const x = st.subscribers.find(s => s.id === dp.subscriberId)!; return (
              <div key={dp.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-start justify-between"><div><div className="flex items-center gap-2 text-xs font-medium text-slate-400">{dp.realId ? <span className="rounded-full bg-[#0b5fff]/10 px-2 py-0.5 font-semibold text-[#0b5fff]">Live PayPal dispute · {dp.paypalStatus}</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5">Simulated</span>}<span>{dp.id} · {dp.reason.replaceAll("_", " ").toLowerCase()}</span></div><div className="mt-1 text-lg font-semibold">{x.name} · {money(dp.amount)}</div></div>
                  {dp.status === "open" ? <button onClick={() => post("/api/dispute", { disputeId: dp.id }, dp.id)} disabled={busy[dp.id]} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">{busy[dp.id] ? "Thinking…" : "Ask agent"}</button> : <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${dp.status === "contested" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>{dp.status}</span>}</div>
                <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm italic text-slate-600">&ldquo;{dp.buyerNote}&rdquo;</p>
                <ul className="mt-3 grid grid-cols-2 gap-1 text-xs text-slate-500"><li>Delivered boxes: {dp.facts.deliveredShipments}</li><li>Last login: {dp.facts.lastLoginDaysAgo}d ago</li><li>Tracking delivered: {String(dp.facts.trackingDelivered)}</li><li>Reminder before renewal: {String(dp.facts.reminderSentBeforeRenewal)}</li></ul>
                {dp.decision && <div className="mt-4 border-t border-slate-100 pt-3 text-sm"><div className="font-medium">{ACTION_LABEL[dp.decision.action]}</div>{!!dp.decision.investigation?.length && <div className="mt-1 font-mono text-[11px] text-slate-400">{dp.decision.investigation.map(z => <div key={z} className="truncate">{z}</div>)}</div>}<p className="mt-1 text-slate-600">{dp.decision.reasoning}</p>
                  {!!dp.evidence?.length && <><div className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Evidence pack</div><ul className="mt-1 list-disc pl-5 text-slate-600">{dp.evidence.map(e => <li key={e}>{e}</li>)}</ul></>}
                  <p className="mt-3 text-xs text-slate-400">{dp.decision.guardrails.join(" · ")}</p>{!!dp.decision.paypal.length && <div className="mt-1 font-mono text-[11px] text-emerald-700">{dp.decision.paypal.map(c => <div key={c}>{c}</div>)}</div>}</div>}
              </div>); })}
          </div>
        </>)}
        {tab === "eval" && (
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2"><div className="flex items-baseline justify-between"><h3 className="font-semibold">Agent evaluation — 12 fixed scenarios, real model</h3><span className="text-right"><span className="text-2xl font-bold text-emerald-600">{EVAL.passed}/{EVAL.total}</span>{"rulesPassed" in EVAL && <span className="block text-xs text-slate-400">keyword rules: {(EVAL as any).rulesPassed}/{EVAL.total}</span>}</span></div>
              <p className="text-xs text-slate-400">5 of the 12 are prompt-injection variants. &ldquo;Keyword rules&rdquo; is the hand-written policy a merchant would use instead (src/lib/baseline.ts). Run locally with POST /api/eval{EVAL.ranAt ? ` · last run ${new Date(EVAL.ranAt).toLocaleString()}` : ""}.</p>
              <table className="mt-3 w-full text-sm"><thead><tr className="text-left text-xs text-slate-400"><th className="py-1">Scenario</th><th>Expected</th><th>Keyword rules</th><th>Agent did</th><th></th></tr></thead><tbody>{EVAL.rows.map((r: any) => <tr key={r.case} className="border-t border-slate-100"><td className="py-1.5">{r.case}</td><td className="text-slate-500">{r.expect}</td><td className={`font-mono text-xs ${r.rulesPass === false ? "text-rose-600" : "text-slate-400"}`}>{r.rules ?? "—"}</td><td className="font-mono text-xs">{r.got}{r.flaggedInjection ? " · flagged" : ""}</td><td>{r.pass ? <span className="text-emerald-600">✓</span> : <span className="text-rose-600">✗</span>}</td></tr>)}</tbody></table></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-semibold">What it means for a real shop</h3><p className="text-xs text-slate-400">Assumptions: 40% of disputes are cancelled-recurring (CFPB), $15 fee per chargeback, prevention rate = exposure removed in this demo.</p>
              {([["subs", "Active subscribers"], ["price", "Avg. monthly price ($)"], ["rate", "Monthly dispute rate (%)"]] as const).map(([k, l]) => <label key={k} className="mt-3 block text-xs text-slate-500">{l}<input type="number" value={calc[k]} onChange={e => setCalc(c => ({ ...c, [k]: Number(e.target.value) }))} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-800" /></label>)}
              {(() => { const prev = st.exposure.before ? 1 - st.exposure.after / st.exposure.before : 0; const monthly = calc.subs * (calc.rate / 100) * 0.4 * (calc.price + 15) * prev; return <div className="mt-4 rounded-xl bg-emerald-50 p-3"><div className="text-xs text-emerald-700">Estimated loss avoided per year</div><div className="text-2xl font-bold text-emerald-700">{money(Math.round(monthly * 12))}</div><div className="text-xs text-emerald-700/80">≈ {Math.round(calc.subs * (calc.rate / 100) * 0.4 * prev * 12)} chargebacks prevented / year</div></div>; })()}
            </div>
          </div>
        )}

        {tab === "log" && (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2"><h3 className="font-semibold">Autopilot — runs on verified PayPal webhooks</h3><p className="text-xs text-slate-400">No click needed: a signed CUSTOMER.DISPUTE.CREATED, BILLING.SUBSCRIPTION.*, PAYMENT.SALE.COMPLETED or PAYMENT.CAPTURE.COMPLETED event wakes the agent for that subscriber.</p>
              {st.autopilot?.length ? <div className="mt-3 max-h-64 overflow-auto text-sm">{st.autopilot.map(e => <div key={e.eventId} className="grid grid-cols-[150px_1fr] gap-3 border-b border-slate-50 py-1.5 sm:grid-cols-[170px_260px_1fr]"><span className="text-xs text-slate-400">{new Date(e.at).toLocaleString()}</span><span className="font-mono text-xs text-emerald-700">{e.eventType}{e.subscriberId ? ` · ${st.subscribers.find(x => x.id === e.subscriberId)?.name ?? ""}` : ""}</span><span className="text-slate-600 sm:col-span-1 col-span-2">{e.outcome}</span></div>)}</div> : <p className="mt-3 text-sm text-slate-400">Waiting for the next PayPal event.</p>}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-semibold">PayPal API calls</h3><p className="text-xs text-slate-400">Real sandbox requests made by the agent and setup</p>
              <div className="mt-3 max-h-[480px] overflow-auto font-mono text-xs">{st.apiCalls.length ? st.apiCalls.map((c, i) => <div key={i} className="flex gap-2 border-b border-slate-50 py-1.5"><span className={c.ok ? "text-emerald-600" : "text-rose-600"}>{c.status}</span><span className="w-12 text-slate-400">{c.method}</span><span className="flex-1 text-slate-700">{c.path}</span><span className="text-slate-400">{c.summary}</span></div>) : <div className="text-slate-400">No calls yet.</div>}</div></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-semibold">Guardrails</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-600"><li>• The model never sets a dollar amount: refunds are computed in code from the PayPal capture, which is re-fetched first.</li><li>• Daily refund cap of $100 (per calendar day, survives resets); refunds above $30 wait for a human click.</li><li>• Every money-moving call carries a PayPal-Request-Id (idempotent — no double refunds).</li><li>• Customer text is wrapped as untrusted data; injection patterns are detected and logged.</li></ul>
              <div className="mt-5 flex items-center justify-between"><h4 className="text-sm font-semibold">Live PayPal webhook events</h4><button onClick={loadEvents} className="rounded-md border border-slate-200 px-2 py-0.5 text-xs">Fetch from PayPal</button></div>
              {events && (events.length ? <div className="mt-2 max-h-48 overflow-auto font-mono text-[11px]">{events.map(e => <div key={e.id} className="flex gap-2 border-b border-slate-50 py-1"><span className="text-emerald-600">{e.type}</span><span className="truncate text-slate-500">{e.summary}</span></div>)}</div> : <p className="mt-2 text-xs text-slate-400">No events yet (PayPal sends them to the deployed URL).</p>)}
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
                {!!d.investigation?.length && <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500"><div className="mb-1 font-semibold text-slate-600">Agent checked PayPal first</div>{d.investigation.map(z => <div key={z} className="truncate font-mono">{z}</div>)}</div>}
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
