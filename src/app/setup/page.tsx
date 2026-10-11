"use client";
import { useState } from "react";
import Link from "next/link";

export default function Setup() {
  const [res, setRes] = useState<{ links?: { label: string; url: string }[]; error?: string; planIds?: Record<string, string> } | null>(null);
  const [busy, setBusy] = useState(false);
  const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const run = async () => { setBusy(true); setRes(await (await fetch("/api/setup", { method: "POST" })).json()); setBusy(false); };
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-slate-800">
      <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">← Back to dashboard</Link>
      <h1 className="mt-4 text-2xl font-semibold">Sandbox setup</h1>
      <p className="mt-2 text-sm text-slate-500">Creates the Brewlab product and plans in PayPal sandbox, plus the renewal payments and subscriptions behind the demo cases. Each link must be approved once with a <b>sandbox personal (buyer) account</b> from the PayPal Developer dashboard.</p>
      {q?.get("done") && <div className="mt-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">Approved and recorded for {q.get("done")}.</div>}
      {q?.get("error") && <div className="mt-4 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{q.get("error")}</div>}
      <button onClick={run} disabled={busy} className="mt-6 rounded-xl bg-[#0b5fff] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40">{busy ? "Creating…" : "Create / refresh sandbox objects"}</button>
      {res?.error && <p className="mt-4 text-sm text-rose-600">{res.error}</p>}
      {res?.links && (
        <ol className="mt-6 space-y-3">
          {res.links.length === 0 && <li className="text-sm text-emerald-700">Everything is already approved.</li>}
          {res.links.map(l => <li key={l.url} className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-sm font-medium">{l.label}</div><a href={l.url} className="mt-1 inline-block text-sm text-[#0b5fff] underline">Approve in PayPal sandbox →</a></li>)}
        </ol>
      )}
    </main>
  );
}
