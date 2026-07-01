import React, { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

export default function PosSimulator() {
  const [members, setMembers] = useState([]);
  const [membershipId, setMembershipId] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("Completed");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState("");

  const loadMembers = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/dev/pos-simulator/members`);
      const data = await res.json();
      setMembers(data.members || []);
    } catch (e) {
      setError(`Failed to load members: ${e.message}`);
    }
  };

  const loadRecent = async () => {
    const { data, error: e } = await supabase
      .from("GROCERY_TRANSACTIONS")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5);
    if (!e) setRecent(data || []);
  };

  useEffect(() => {
    loadMembers();
    loadRecent();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setResult(null);
    if (!membershipId || !amount) {
      setError("Pick a member and enter an amount");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/dev/simulate-pos-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membership_id: membershipId,
          amount: parseFloat(amount),
          status,
        }),
      });
      const body = await res.json();
      setResult({ httpStatus: res.status, ...body });
      await loadRecent();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">POS Simulator</h1>
        <p className="text-sm text-gray-500 mb-6">
          Dev-only. Sends a signed synthetic POS event to the
          <code className="mx-1 px-1 bg-gray-100 rounded">Pos-webhook</code>
          edge function. Successful sales appear in
          <code className="mx-1 px-1 bg-gray-100 rounded">GROCERY_TRANSACTIONS</code>
          and roll up into MIGS totals.
        </p>

        <form
          onSubmit={submit}
          className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Member
            </label>
            <select
              value={membershipId}
              onChange={(e) => setMembershipId(e.target.value)}
              className="w-full border border-gray-300 rounded-md p-2 text-sm"
            >
              <option value="">Select a member…</option>
              {members.map((m) => (
                <option key={m.id} value={m.membership_id}>
                  {m.membership_id} — {m.last_name}, {m.first_name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount (PHP)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full border border-gray-300 rounded-md p-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full border border-gray-300 rounded-md p-2 text-sm"
              >
                <option value="Completed">Completed (cash)</option>
                <option value="On Credit">On Credit (utang)</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-md disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send POS event"}
          </button>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>
          )}

          {result && (
            <div className="text-xs bg-gray-50 border border-gray-200 rounded p-3 font-mono whitespace-pre-wrap overflow-x-auto">
              {JSON.stringify(result, null, 2)}
            </div>
          )}
        </form>

        <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">
          Latest 5 transactions
        </h2>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                <th className="p-3">Grocery ID</th>
                <th className="p-3">Member Ref</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Status</th>
                <th className="p-3">When</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-gray-400">
                    No transactions yet.
                  </td>
                </tr>
              ) : (
                recent.map((r) => (
                  <tr key={r.GroceryID} className="border-t border-gray-100">
                    <td className="p-3 font-mono text-xs">{r.GroceryID}</td>
                    <td className="p-3">{r.pos_member_ref || "—"}</td>
                    <td className="p-3">
                      ₱{Number(r.GroceryAmount).toLocaleString()}
                    </td>
                    <td className="p-3">{r.Status}</td>
                    <td className="p-3 text-gray-500">
                      {new Date(r.TransactionDate).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
