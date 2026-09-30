import React, { useCallback, useEffect, useState } from "react";
import { HandCoins, History, Printer, X as CloseIcon, AlertTriangle, Wallet } from "lucide-react";
import StaffSidebar from "../../components/StaffSidebar";
import { cashierNav } from "../../components/StaffSidebar/configs/cashier";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import Breadcrumb from "../../components/Breadcrumb";
import { StatCard, StatCardRow } from "../../components/StatCard";
import { TableToolbar } from "../../components/TableToolbar";
import TableStateRow from "../../components/TableStateRow";
import TableActionButton from "../../components/TableActionButton";
import { useNotification } from "../../contex/NotificationContext";
import { useConfirm } from "../../contex/ConfirmContext";
import { supabase } from "../../supabaseClient";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

// CBU payout to terminated members (Account Management plan, Part B).
// When the BOD terminates a member, their CBU first pays off any remaining
// loans; what's left is handed to the member here, in one or more payouts.
// No cash-vault movement: the Treasurer adjusts the vault by hand.

const peso = (n) =>
  `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
};

async function api(path, { method = "GET", body } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.detail || "Request failed.");
  return payload;
}

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-green-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-600/30";

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Opens a printable receipt in a new window.
function printReceipt(r) {
  const win = window.open("", "_blank", "width=420,height=600");
  if (!win) return;
  const row = (label, value) => `<tr><td style="padding:4px 0;color:#555">${label}</td><td style="padding:4px 0;text-align:right;font-weight:600">${value}</td></tr>`;
  win.document.write(`<!doctype html><html><head><title>CBU Payout ${esc(r.reference)}</title></head>
    <body style="font-family:Arial,sans-serif;padding:24px;color:#111">
      <h2 style="margin:0">TTMPC</h2>
      <p style="margin:2px 0 16px;color:#555">CBU Payout Receipt</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${row("Reference", esc(r.reference))}
        ${row("Date", formatDate(r.payout_date))}
        ${row("Member", esc(`${r.name} (${r.membership_id})`))}
        ${row("Amount paid", peso(r.amount))}
        ${row("CBU still owed", peso(r.remaining_after))}
        ${row("Recorded by", esc(r.recorded_by || "—"))}
      </table>
      ${r.closed ? '<p style="margin-top:16px;font-weight:600">CBU fully paid out — membership closed.</p>' : ""}
      <p style="margin-top:40px;border-top:1px solid #999;padding-top:6px;width:60%;font-size:12px">Received by (member signature)</p>
      <script>window.onload=function(){window.print()}</script>
    </body></html>`);
  win.document.close();
}

function PayoutModal({ member, onClose, onRecorded }) {
  const confirm = useConfirm();
  const [amount, setAmount] = useState(String(member.remaining));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const value = Number(amount);
  const valid = Number.isFinite(value) && value > 0 && value <= member.remaining + 0.001;

  const submit = async () => {
    const ok = await confirm({
      title: "Record CBU payout",
      message: `Pay ${peso(value)} in cash to ${member.name}? ${
        value < member.remaining ? `${peso(member.remaining - value)} will still be owed to them.` : "This settles their CBU and closes their membership."
      }`,
      confirmLabel: "Record payout",
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      const body = await api("/api/cashier/cbu-payouts", {
        method: "POST",
        body: { membership_id: member.membership_id, amount: value, reference: reference || null, notes: notes || null },
      });
      onRecorded(body.data);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
          <div>
            <h3 className="font-bold text-gray-800">Record CBU payout</h3>
            <p className="mt-0.5 text-xs text-gray-500">{member.name} · {member.membership_id}</p>
          </div>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="text-gray-400 hover:text-gray-600">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 px-6 py-5">
          <dl className="space-y-1.5 rounded-lg border border-gray-200 px-4 py-3 text-sm">
            <div className="flex justify-between"><dt className="text-gray-600">CBU at termination</dt><dd className="font-semibold">{peso(member.cbu_total)}</dd></div>
            {member.applied_to_loans > 0 ? (
              <div className="flex justify-between"><dt className="text-gray-600">Applied to loans</dt><dd className="text-red-700">− {peso(member.applied_to_loans)}</dd></div>
            ) : null}
            {member.paid_so_far > 0 ? (
              <div className="flex justify-between"><dt className="text-gray-600">Paid out so far</dt><dd className="text-red-700">− {peso(member.paid_so_far)}</dd></div>
            ) : null}
            <div className="flex justify-between border-t border-gray-100 pt-1.5"><dt className="font-semibold text-gray-800">Still owed to member</dt><dd className="font-bold text-green-700">{peso(member.remaining)}</dd></div>
          </dl>
          <div>
            <label className="mb-1 block text-xs font-bold text-gray-700">Amount to pay now <span className="text-red-500">*</span></label>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} disabled={busy} />
            <p className="mt-1 text-[11px] text-gray-500">Partial payouts are allowed — up to {peso(member.remaining)}.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-gray-700">Reference</label>
            <input value={reference} onChange={(e) => setReference(e.target.value)} className={inputClass} placeholder="Leave blank to generate one" disabled={busy} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-gray-700">Notes</label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} disabled={busy} />
          </div>
          <p className="text-[11px] text-gray-500">The cash vault isn&apos;t changed here — the Treasurer records it separately.</p>
          {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button onClick={onClose} disabled={busy} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button onClick={submit} disabled={busy || !valid} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? "Recording…" : "Record payout"}
          </button>
        </div>
      </div>
    </div>
  );
}

const Cashier_CBU_Payout = () => {
  const { addNotification } = useNotification();
  const [pending, setPending] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(null);
  const [receipt, setReceipt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const body = await api("/api/cashier/cbu-payouts");
      setPending(body.pending || []);
      setHistory(body.history || []);
    } catch (err) {
      addNotification(err.message || "Failed to load CBU payouts.", "error");
    } finally {
      setLoading(false);
    }
  }, [addNotification]);

  useEffect(() => {
    load();
  }, [load]);

  const totalOwed = pending.reduce((sum, r) => sum + Number(r.remaining || 0), 0);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal="Cashier" items={cashierNav} />

      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-y-auto">
        <StaffTopbar portal="Cashier" notifications={<LoanNotificationBell role="cashier" />} />

        <main className="animate-page-in overflow-auto p-8">
          <Breadcrumb portal="Cashier" page="CBU Payout" />
          <h1 className="mb-1 text-2xl font-bold text-[#1F3E35]">CBU Payout</h1>
          <p className="mb-6 text-sm text-gray-500">
            Hand terminated members the CBU still owed to them. Their loans were already paid from their CBU when the BOD terminated them.
          </p>

          <StatCardRow cols={3}>
            <StatCard label="Awaiting payout" value={pending.length} icon={Wallet} iconColor="text-amber-600" loading={loading} />
            <StatCard label="Total CBU owed" value={peso(totalOwed)} icon={HandCoins} iconColor="text-green-600" loading={loading} />
            <StatCard label="Payouts recorded" value={history.length} icon={History} iconColor="text-blue-600" loading={loading} />
          </StatCardRow>

          <div className="mt-6 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <TableToolbar title="Awaiting Payout" subtitle={`${pending.length} terminated members still owed CBU`} />
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="bg-primary-deep text-[10px] font-extrabold uppercase tracking-wider text-white">
                    <th className="p-5 font-bold">Member</th>
                    <th className="p-5 font-bold">Terminated</th>
                    <th className="p-5 font-bold text-right">CBU</th>
                    <th className="p-5 font-bold text-right">Applied to Loans</th>
                    <th className="p-5 font-bold text-right">Paid So Far</th>
                    <th className="p-5 font-bold text-right">Still Owed</th>
                    <th className="p-5 font-bold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <TableStateRow colSpan={7} variant="loading" label="Loading…" />
                  ) : pending.length === 0 ? (
                    <TableStateRow colSpan={7} variant="empty" icon={Wallet} label="No CBU payouts pending." />
                  ) : (
                    pending.map((row) => (
                      <tr key={row.membership_id} className="border-b border-gray-100 transition-colors hover:bg-gray-50/50">
                        <td className="p-5">
                          <p className="font-semibold text-gray-800">{row.name}</p>
                          <p className="text-xs text-gray-500">{row.membership_id}</p>
                        </td>
                        <td className="p-5 text-gray-700">
                          {formatDate(row.termination_date)}
                          <p className="text-[11px] text-gray-500">{row.resolution_no}</p>
                        </td>
                        <td className="p-5 text-right text-gray-800">{peso(row.cbu_total)}</td>
                        <td className="p-5 text-right text-gray-700">{peso(row.applied_to_loans)}</td>
                        <td className="p-5 text-right text-gray-700">{peso(row.paid_so_far)}</td>
                        <td className="p-5 text-right font-bold text-green-700">{peso(row.remaining)}</td>
                        <td className="p-5">
                          <TableActionButton icon={HandCoins} onClick={() => setPaying(row)}>Pay Out</TableActionButton>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <TableToolbar title="Payout History" subtitle="Latest 100 CBU payouts" />
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="bg-primary-deep text-[10px] font-extrabold uppercase tracking-wider text-white">
                    <th className="p-5 font-bold">Date</th>
                    <th className="p-5 font-bold">Reference</th>
                    <th className="p-5 font-bold">Member</th>
                    <th className="p-5 font-bold text-right">Amount</th>
                    <th className="p-5 font-bold">Recorded By</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <TableStateRow colSpan={5} variant="loading" label="Loading…" />
                  ) : history.length === 0 ? (
                    <TableStateRow colSpan={5} variant="empty" icon={History} label="No payouts recorded yet." />
                  ) : (
                    history.map((h) => (
                      <tr key={h.id} className="border-b border-gray-100">
                        <td className="p-5 text-gray-700">{formatDate(h.payout_date)}</td>
                        <td className="p-5 font-mono text-xs text-gray-700">{h.reference}</td>
                        <td className="p-5">
                          <p className="font-semibold text-gray-800">{h.name}</p>
                          <p className="text-xs text-gray-500">{h.membership_id}</p>
                        </td>
                        <td className="p-5 text-right font-semibold text-gray-800">{peso(h.amount)}</td>
                        <td className="p-5 text-gray-600">{h.recorded_by_email || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {paying ? (
        <PayoutModal
          member={paying}
          onClose={() => setPaying(null)}
          onRecorded={(data) => {
            setPaying(null);
            setReceipt(data);
            addNotification(
              data.closed
                ? `${data.name}'s CBU is fully paid out. Their membership is now closed.`
                : `Paid ${peso(data.amount)} to ${data.name}. ${peso(data.remaining_after)} is still owed.`,
              "success"
            );
            load();
          }}
        />
      ) : null}

      {receipt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="px-6 py-5">
              <h3 className="flex items-center gap-2 font-bold text-gray-800">
                <HandCoins className="h-5 w-5 text-green-700" /> Payout recorded
              </h3>
              <dl className="mt-4 space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-gray-600">Reference</dt><dd className="font-mono text-xs font-semibold">{receipt.reference}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-600">Member</dt><dd className="font-semibold">{receipt.name}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-600">Amount paid</dt><dd className="font-bold text-green-700">{peso(receipt.amount)}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-600">Still owed</dt><dd className="font-semibold">{peso(receipt.remaining_after)}</dd></div>
              </dl>
              {receipt.closed ? (
                <p className="mt-3 flex gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-gray-500" /> CBU fully paid out — the membership is now closed.
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
              <button onClick={() => printReceipt(receipt)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                <Printer className="h-4 w-4" /> Print receipt
              </button>
              <button onClick={() => setReceipt(null)} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700">Done</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Cashier_CBU_Payout;
