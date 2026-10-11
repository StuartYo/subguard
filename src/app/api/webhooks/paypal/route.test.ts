// Webhook endpoint: unsigned or forged events are rejected, and a redelivered event never runs the agent twice.
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ verification: "SUCCESS", handled: [] as string[], autopilot: [] as { eventId: string }[], afterFns: [] as (() => Promise<void>)[] }));
vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) },
  after: (fn: () => Promise<void>) => st.afterFns.push(fn),
}));
vi.mock("@/lib/paypal", () => ({
  listWebhooks: async () => ({ webhooks: [{ id: "WH-ID", url: "https://demo.test/api/webhooks/paypal" }] }),
  verifyWebhook: async () => ({ verification_status: st.verification }),
}));
vi.mock("@/lib/store", () => ({ load: () => ({ autopilot: st.autopilot }), save: () => undefined }));
vi.mock("@/lib/autopilot", () => ({ handleEvent: async (_s: unknown, e: { id: string }) => { st.handled.push(e.id); st.autopilot.push({ eventId: e.id }); } }));

import { POST } from "./route";
const call = (id: string, ip = "1.2.3.4") => POST(new Request("https://demo.test/api/webhooks/paypal", { method: "POST", headers: { "x-forwarded-for": ip }, body: JSON.stringify({ id, event_type: "BILLING.SUBSCRIPTION.ACTIVATED", resource: { id: "I-X" } }) })) as Promise<any>;
const flush = async () => { for (const f of st.afterFns.splice(0)) await f(); };

beforeEach(() => { st.verification = "SUCCESS"; st.handled = []; st.autopilot = []; st.afterFns = []; });

describe("PayPal webhook endpoint", () => {
  it("rejects an event whose signature PayPal does not verify", async () => {
    st.verification = "FAILURE";
    const r = await call("WH-FORGED"); await flush();
    expect(r.status).toBe(400); expect(st.handled).toEqual([]);
  });
  it("runs the agent once for a verified event", async () => {
    const r = await call("WH-1"); await flush();
    expect(r.status).toBe(200); expect(st.handled).toEqual(["WH-1"]);
  });
  it("ignores a redelivered event id", async () => {
    await call("WH-2"); await flush();
    const again = await call("WH-2"); await flush();
    expect(again.body.duplicate).toBe(true); expect(st.handled).toEqual(["WH-2"]);
  });
});
