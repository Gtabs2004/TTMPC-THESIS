import React, { useEffect, useMemo, useState } from "react";
import { X, Search, Undo2, AlertTriangle } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { UserAuth } from "../../contex/AuthContext";

/**
 * ISC Payout Preferences — the March General Assembly step.
 *
 * This is the ONLY screen where a member's share capital actually changes
 * (ISC_DIVIDEND_PLAN.md §14, §17.2, §23). isc_post() only ever records a
 * payable; it never touches capital_build_up. A member's balance moves
 * exclusively when this modal calls isc_settle_posting() with that member
 * left OFF the cash list — i.e. when they choose Share Capital.
 *
 * Default is SHARE CAPITAL for every member — matching isc_settle_posting's
 * own SQL default, where omission from the cash list means capitalise
 * (§17.2). Unchecking a member marks them Withdraw instead; their share
 * capital stays untouched for this posting.
 *
 * This component always passes an EXPLICIT p_cash_member_ids built from
 * whatever is on screen (every row not marked "capital"), rather than
 * relying on the RPC's own default — so the UI can never silently disagree
 * with what actually gets saved.
 *
 * Nothing here recomputes a payout. interest_amount comes straight from
 * isc_transactions, exactly as isc_post wrote it from the preview.
 */

const PESO = (n) =>
  n === null || n === undefined
    ? "—"
    : `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const FILTERS = [
  { key: "all", label: "All" },
  { key: "withdraw", label: "Withdraw Only" },
  { key: "capital", label: "Share Capital Only" },
];

export default function IscPayoutPreferencesModal({ open, postingId, onClose, onSettled }) {
  const { session } = UserAuth();

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [posting, setPosting] = useState(null); // { period_start, period_end, allocated_pool, status }
  const [rows, setRows] = useState([]); // isc_transactions joined to member

  // choice[member_id] = "withdraw" | "capital". Loaded pre-selected to
  // "capital" for every row — a member keeps their payout in share capital
  // unless the bookkeeper unchecks them, matching isc_settle_posting's own
  // default (§17.2).
  const [choice, setChoice] = useState({});

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [bulkBanner, setBulkBanner] = useState(null); // { label, previous }

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (!open || !postingId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setLoadError("");
      try {
        const [postingRes, txRes] = await Promise.all([
          supabase
            .from("isc_postings")
            .select("id, period_start, period_end, allocated_pool, status")
            .eq("id", postingId)
            .single(),
          supabase
            .from("isc_transactions")
            .select(
              "id, member_id, interest_amount, settlement, member:member_id(membership_id, first_name, middle_initial, last_name)"
            )
            .eq("isc_posting_id", postingId)
            .order("interest_amount", { ascending: false }),
        ]);

        if (postingRes.error) throw new Error(postingRes.error.message);
        if (txRes.error) throw new Error(txRes.error.message);
        if (cancelled) return;

        setPosting(postingRes.data);
        const list = txRes.data || [];
        setRows(list);

        // Pre-select every row to Share Capital — the default matches
        // isc_settle_posting's own SQL default, where OMISSION from the cash
        // list means capitalise (§17.2). A member already settled as "cash"
        // in a previous save keeps showing Withdraw; one already
        // "capitalised" keeps showing Share Capital.
        const initial = {};
        list.forEach((r) => {
          initial[r.member_id] = r.settlement === "cash" ? "withdraw" : "capital";
        });
        setChoice(initial);
      } catch (err) {
        if (!cancelled) setLoadError(err?.message || "Unable to load computed members.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, postingId]);

  const memberName = (r) => {
    const m = r.member || {};
    return [m.first_name, m.middle_initial, m.last_name].filter(Boolean).join(" ") || "—";
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const hay = `${memberName(r)} ${r.member?.membership_id || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filter === "withdraw") return choice[r.member_id] === "withdraw";
      if (filter === "capital") return choice[r.member_id] === "capital";
      return true;
    });
  }, [rows, search, filter, choice]);

  // Totals computed over EVERY row, never the filtered/visible subset — the
  // footer is what the bookkeeper checks before saving, and a filtered total
  // would understate what is actually about to be settled.
  const totals = useMemo(() => {
    let totalPayout = 0;
    let withdrawCount = 0;
    let withdrawTotal = 0;
    let capitalCount = 0;
    let capitalTotal = 0;
    rows.forEach((r) => {
      const amt = Number(r.interest_amount || 0);
      totalPayout += amt;
      if (choice[r.member_id] === "capital") {
        capitalCount += 1;
        capitalTotal += amt;
      } else {
        withdrawCount += 1;
        withdrawTotal += amt;
      }
    });
    return {
      members: rows.length,
      totalPayout,
      withdrawCount,
      withdrawTotal,
      capitalCount,
      capitalTotal,
    };
  }, [rows, choice]);

  const alreadySettled = (posting?.status || "") === "settled";
  const canEdit = !alreadySettled && !saving;

  const setOne = (memberId, value) => {
    if (!canEdit) return;
    setChoice((prev) => ({ ...prev, [memberId]: value }));
    setBulkBanner(null);
  };

  const applyBulk = (value) => {
    if (!canEdit || !filtered.length) return;
    const previous = { ...choice };
    setChoice((prev) => {
      const next = { ...prev };
      filtered.forEach((r) => {
        next[r.member_id] = value;
      });
      return next;
    });
    setBulkBanner({
      label:
        value === "capital"
          ? `Applying Share Capital to ${filtered.length} filtered member${filtered.length === 1 ? "" : "s"}.`
          : `Applying Withdraw to ${filtered.length} filtered member${filtered.length === 1 ? "" : "s"}.`,
      previous,
    });
  };

  const undoBulk = () => {
    if (!bulkBanner) return;
    setChoice(bulkBanner.previous);
    setBulkBanner(null);
  };

  const handleSave = async () => {
    if (!posting || alreadySettled) return;
    setSaving(true);
    setSaveError("");
    try {
      // isc_settle_posting's OWN default is capitalise-on-omission (§17.2).
      // This component never relies on that default: it always sends the
      // explicit set of members NOT marked "capital" as the cash list, so
      // the RPC's behaviour matches exactly what is shown on screen.
      const cashMemberIds = rows
        .filter((r) => choice[r.member_id] !== "capital")
        .map((r) => r.member_id);

      const { data, error } = await supabase.rpc("isc_settle_posting", {
        p_posting_id: postingId,
        p_cash_member_ids: cashMemberIds,
        p_effective_date: effectiveDate,
      });
      if (error) throw new Error(error.message || "Failed to save payout preferences.");

      const result = Array.isArray(data) ? data[0] : data;
      onSettled?.(result);
      onClose?.();
    } catch (err) {
      setSaveError(err?.message || "Unable to save payout preferences.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm dialog-enter p-4"
      onClick={() => !saving && onClose?.()}
    >
      <div
        className="dialog-card bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden border border-transparent"
        onClick={(e) => e.stopPropagation()}
      >
        {/* A. Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Set Member Payout Preferences (March Voted)</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Manage payout allocations for all computed members. Default action is set to Share Capital —
              uncheck a member to withdraw their payout as cash instead.
            </p>
          </div>
          <button
            type="button"
            onClick={() => !saving && onClose?.()}
            className="text-gray-400 hover:text-gray-600 transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {alreadySettled && (
          <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 shrink-0">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            This posting has already been settled. Preferences shown are the choices already recorded and cannot be
            changed here.
          </div>
        )}

        {loadError && (
          <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 shrink-0">
            {loadError}
          </div>
        )}

        {/* B. Global action & filter bar */}
        <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-gray-100 shrink-0">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search member name or account ID..."
              className="w-full h-9 bg-gray-50 focus:bg-white border border-gray-300 rounded-lg pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
            />
          </div>

          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-9 rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
          >
            {FILTERS.map((f) => (
              <option key={f.key} value={f.key}>
                Show: {f.label}
              </option>
            ))}
          </select>

          <div className="ml-auto flex items-center gap-2">
            <label className="text-xs text-gray-500 flex items-center gap-1.5">
              Effective date
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                disabled={!canEdit}
                className="h-9 rounded-lg border border-gray-300 px-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:bg-gray-100 disabled:text-gray-400"
              />
            </label>
            <button
              type="button"
              onClick={() => applyBulk("withdraw")}
              disabled={!canEdit || !filtered.length}
              className="h-9 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Set All to Withdraw
            </button>
            <button
              type="button"
              onClick={() => applyBulk("capital")}
              disabled={!canEdit || !filtered.length}
              className="h-9 px-3 rounded-lg border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-xs font-semibold text-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Set All to Share Capital
            </button>
          </div>
        </div>

        {bulkBanner && (
          <div className="mx-6 mt-3 flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 shrink-0">
            <span>Notice: {bulkBanner.label}</span>
            <button
              type="button"
              onClick={undoBulk}
              className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:text-blue-900 shrink-0"
            >
              <Undo2 className="w-3 h-3" /> Undo Action
            </button>
          </div>
        )}

        {/* C. High-density member table */}
        <div className="flex-1 overflow-auto px-6 mt-3 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-full text-sm text-gray-400">Loading members…</div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-3 font-bold">Member</th>
                  <th className="py-2 px-3 font-bold text-right">Calculated Payout</th>
                  <th className="py-2 px-3 font-bold text-center">Payout Choice</th>
                  <th className="py-2 pl-3 font-bold text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const value = choice[r.member_id] || "withdraw";
                  return (
                    <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50/60">
                      <td className="py-2.5 pr-3">
                        <div className="font-medium text-gray-900">{memberName(r)}</div>
                        <div className="text-[10px] text-gray-400">ID: {r.member?.membership_id || "—"}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-gray-900">
                        {PESO(r.interest_amount)}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex justify-center">
                          <div className="inline-flex rounded-full border border-gray-200 bg-gray-100 p-0.5">
                            <button
                              type="button"
                              onClick={() => setOne(r.member_id, "withdraw")}
                              disabled={!canEdit}
                              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors disabled:cursor-not-allowed ${
                                value === "withdraw"
                                  ? "bg-emerald-600 text-white shadow-sm"
                                  : "text-gray-500 hover:text-gray-700"
                              }`}
                            >
                              Withdraw
                            </button>
                            <button
                              type="button"
                              onClick={() => setOne(r.member_id, "capital")}
                              disabled={!canEdit}
                              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors disabled:cursor-not-allowed ${
                                value === "capital"
                                  ? "bg-indigo-600 text-white shadow-sm"
                                  : "text-gray-500 hover:text-gray-700"
                              }`}
                            >
                              Share Capital
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 pl-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                            value === "capital"
                              ? "bg-indigo-100 text-indigo-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {value === "capital" ? "Share Capital" : "Withdraw"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {!filtered.length && (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-sm text-gray-400">
                      No members match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* D. Sticky summary footer */}
        <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-6 py-3">
          {saveError && (
            <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {saveError}
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <Stat label="Computed Members" value={totals.members.toLocaleString()} />
            <Stat label="Total Computed Payout" value={PESO(totals.totalPayout)} />
            <Stat
              label="Total Withdrawing"
              value={PESO(totals.withdrawTotal)}
              hint={`${totals.withdrawCount} member${totals.withdrawCount === 1 ? "" : "s"}`}
              tone="withdraw"
            />
            <Stat
              label="Retained in Share Capital"
              value={PESO(totals.capitalTotal)}
              hint={`${totals.capitalCount} member${totals.capitalCount === 1 ? "" : "s"}`}
              tone="capital"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => !saving && onClose?.()}
              disabled={saving}
              className="h-10 px-4 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-sm font-semibold text-gray-700 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canEdit || loading || !rows.length}
              className="h-10 px-5 rounded-lg bg-primary hover:bg-primary-deep text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save & Confirm Payouts"}
            </button>
          </div>
          {session?.user?.email && (
            <p className="text-[10px] text-gray-400 text-right mt-1.5">Recording as {session.user.email}</p>
          )}
        </div>
      </div>
    </div>
  );
}

const Stat = ({ label, value, hint, tone }) => (
  <div className="bg-white rounded-lg border border-gray-200 px-3 py-2">
    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</div>
    <div
      className={`mt-0.5 text-base font-bold tabular-nums ${
        tone === "capital" ? "text-indigo-700" : tone === "withdraw" ? "text-emerald-700" : "text-gray-900"
      }`}
    >
      {value}
    </div>
    {hint && <div className="text-[10px] text-gray-400">{hint}</div>}
  </div>
);
