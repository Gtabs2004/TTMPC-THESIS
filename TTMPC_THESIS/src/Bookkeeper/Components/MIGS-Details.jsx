import React, { useEffect, useState } from "react";
import { NavLink, useNavigate, useSearchParams } from "react-router-dom";
import StaffSidebar from "../../components/StaffSidebar";
import { bookkeeperNav } from "../../components/StaffSidebar/configs/bookkeeper";
import { UserAuth } from "../../contex/AuthContext";
import { useConfirm } from "../../contex/ConfirmContext";
import { PortalTopbarIdentity } from "../../components/PortalIdentity";
import {
  LayoutDashboard,
  Users,
  FileText,
  CreditCard,
  Calculator,
  Activity,
  BarChart3,
  History,
  Bell,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  PiggyBank,
  Edit2,
  Download,
  Briefcase,
  Wallet,
  Coins,
  ShieldAlert,
  Brain,
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

// Must match the criterion label the engine emits
// (migs_engine.py compute_migs_score). It is the only bookkeeper-entered
// criterion -- the other six are derived from ledgers.
const OUTSIDE_LOAN_CRITERION = "Loans from Other PLIs";

const MIGSDetails = () => {
    const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const memberId = searchParams.get("member_id");
  const confirm = useConfirm();

  const [memberData, setMemberData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (message, kind = "success") => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchMember = async () => {
    const year = new Date().getFullYear();
    const response = await fetch(
      `${API_BASE_URL}/api/migs/members/${encodeURIComponent(memberId)}?year=${year}`
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.success) {
      throw new Error(result?.detail || "Failed to load member data.");
    }
    return result.data || null;
  };



  useEffect(() => {
    const loadMemberData = async () => {
      setLoading(true);
      setError("");
      try {
        setMemberData(await fetchMember());
      } catch (err) {
        setError(err?.message || "Failed to load member data");
        setMemberData(null);
      } finally {
        setLoading(false);
      }
    };

    if (memberId) {
      loadMemberData();
    } else {
      setError("No member selected.");
      setLoading(false);
    }
  }, [memberId]);


  const handleRecalculate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const fresh = await fetchMember();
      setMemberData(fresh);
      showToast(`Recalculated. Score: ${fresh?.migs_score ?? "—"} (${fresh?.migs_status ?? "—"}).`);
    } catch (err) {
      showToast(err?.message || "Recalculation failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  // `value` is the answer being recorded, so each button on the row is an
  // explicit statement. It is NOT driven by the confirm dialog's boolean:
  // ConfirmDialog resolves false for Escape, the backdrop, and the X as well
  // as for Cancel, so treating false as "No outside loan" would silently
  // record an answer nobody gave -- and this answer is worth 10 points, enough
  // to cross the MIGS threshold on its own.
  const handleDeclareOutsideLoan = async (value) => {
    if (busy) return;
    const current = memberData?.has_outside_loan;
    if (current === value) return; // already recorded that way

    const ok = await confirm({
      title: "Loans from Other PLIs",
      message: value
        ? `Record that ${memberData?.full_name || "this member"} HAS a loan with another Private Lending Institution? This scores 0 of 10 points.`
        : `Record that ${memberData?.full_name || "this member"} has NO loan with another Private Lending Institution? This scores 10 of 10 points.`,
      confirmLabel: value ? "Record: has outside loan" : "Record: no outside loan",
      tone: "warning",
    });
    if (!ok) return;

    setBusy(true);
    try {
      const year = new Date().getFullYear();
      const res = await fetch(
        `${API_BASE_URL}/api/migs/members/${encodeURIComponent(memberId)}/outside-loan`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ has_outside_loan: value, year }),
        }
      );
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result?.detail || "Failed to save the declaration.");
      const fresh = await fetchMember();
      setMemberData(fresh);
      showToast(
        `Recorded: ${value ? "has an outside loan" : "no outside loan"}. ` +
          `Score is now ${fresh?.migs_score ?? "—"} (${fresh?.migs_status ?? "—"}).`
      );
    } catch (err) {
      showToast(err?.message || "Failed to save the declaration.", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleFinalizeScore = async () => {
    if (busy) return;
    const ok = await confirm({
      title: "Finalize MIGS Classification",
      message: "Finalize and snapshot this year's MIGS classification for all members? This writes an official row to member_classification_temporal that other modules read.",
      confirmLabel: "Finalize",
      tone: "warning",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const year = new Date().getFullYear();
      const res = await fetch(
        `${API_BASE_URL}/api/migs/recompute-all?year=${year}`,
        { method: "POST" }
      );
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result?.detail || "Finalize failed.");
      const total = (result?.inserted || 0) + (result?.updated || 0);
      const fresh = await fetchMember();
      setMemberData(fresh);
      showToast(
        `Snapshot saved. ${total} members labeled as of ${result?.accrual_date}.`,
        result?.errors?.length ? "warning" : "success"
      );
    } catch (err) {
      showToast(err?.message || "Finalize failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      <StaffSidebar portal="Bookkeeper" items={bookkeeperNav} />

      <div className="flex-1 flex flex-col">
        <header className="bg-white h-16 shadow-sm flex items-center justify-between px-8 border-b border-gray-100 shrink-0">
          <button onClick={() => navigate("/migs")} className="flex items-center gap-2 text-gray-700 hover:text-gray-900 transition-colors">
            <ChevronLeft className="w-5 h-5" />
            <span className="font-medium">Back to MIGS Scoring</span>
          </button>
          <div className="flex items-center gap-4">
            <button className="relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
            </button>
            <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
              <img src="/img/bookkeeper-profile.png" alt="Profile" className="w-8 h-8 rounded-full bg-gray-200" />
              <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Bookkeeper" />
            </div>
          </div>
        </header>

        <main className="p-8 flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-center text-blue-700">Loading member data...</p>
          ) : error ? (
            <p className="text-center text-red-600">{error}</p>
          ) : memberData ? (
            <div className="max-w-[1600px]">
              {/* Member Header */}
              {/* items-center (was items-start) so the badge sits on the
                  member's optical centre instead of riding the top edge. */}
              <div className="bg-white rounded-xl px-6 py-5 mb-5 border border-gray-200">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                      <span className="text-lg font-bold text-green-700">
                        {(memberData.full_name || "?").charAt(0)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <h1 className="text-2xl leading-tight font-bold text-gray-900 truncate">
                        {memberData.full_name || "Unknown Member"}
                      </h1>
                      {/* ID and year demoted to a single secondary line, with
                          a dot separator instead of a bare ml-4 gap. */}
                      <p className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                        <span className="font-mono">#{memberData.member_id || "—"}</span>
                        {memberData.year ? (
                          <>
                            <span className="text-gray-300">•</span>
                            <span>{memberData.year}</span>
                          </>
                        ) : null}
                      </p>
                    </div>
                  </div>
                  {memberData.migs_status ? (
                    <div className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full font-semibold text-sm border shrink-0 ${
                      memberData.migs_status === "MIGS Qualified"
                        ? "bg-green-100 text-green-700 border-green-200"
                        : "bg-red-100 text-red-700 border-red-200"
                    }`}>
                      <span className="leading-none">
                        {memberData.migs_status === "MIGS Qualified" ? "✓" : "○"}
                      </span>
                      {memberData.migs_status}
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full font-semibold text-sm bg-gray-100 text-gray-500 border border-gray-200 shrink-0">
                      Not scored yet
                    </div>
                  )}
                </div>
              </div>

              {/* Scoring Breakdown */}
              {/* Stacks below lg so the table keeps its width on a laptop
                  instead of being squeezed into a third of the viewport. */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6 items-start">
                {/* Left: Scoring Breakdown Table */}
                <div className="lg:col-span-2 min-w-0">
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-200">
                      <h2 className="text-base font-bold text-gray-900">Scoring Breakdown</h2>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          {/* Value is right-aligned so the peso amounts stack;
                              Progress gets a fixed width so every bar in the
                              column is identical regardless of row content. */}
                          <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
                            <th className="px-5 py-2.5 font-bold w-full">Criterion</th>
                            <th className="px-3 py-2.5 font-bold text-right w-[130px]">Value</th>
                            <th className="px-3 py-2.5 font-bold text-right whitespace-nowrap w-[80px]">Score</th>
                            <th className="px-3 py-2.5 font-bold text-left w-[124px]">Progress</th>
                            <th className="px-3 py-2.5 font-bold text-right w-[92px]">
                              <span className="sr-only">Actions</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {memberData.scoring_breakdown.map((item, index) => {
                            const isCurrency =
                              item.criterion.toLowerCase().includes("capital") ||
                              item.criterion.toLowerCase().includes("loan availed") ||
                              item.criterion.toLowerCase().includes("savings") ||
                              item.criterion.toLowerCase().includes("groceries");
                            const formattedValue =
                              item.value == null
                                ? <span className="text-gray-400 text-xs">Not wired yet</span>
                                : typeof item.value === "number"
                                ? isCurrency
                                  ? `₱${item.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                  : item.value.toLocaleString()
                                : item.value;

                            // "Loans from Other PLIs" is the one criterion a
                            // person supplies; everything else is derived.
                            const isOutsideLoanRow = item.criterion === OUTSIDE_LOAN_CRITERION;
                            const declared = memberData.has_outside_loan;
                            // Unanswered and "confirmed none" both score 10/10,
                            // so they must never look the same on screen.
                            const outsideLoanLabel = !isOutsideLoanRow ? null : declared == null ? (
                              <span className="text-amber-600 text-xs font-medium">Not recorded</span>
                            ) : declared ? (
                              <span className="text-red-600 text-xs font-semibold">Has outside loan</span>
                            ) : (
                              <span className="text-gray-700 text-xs">None</span>
                            );

                            return (
                              <tr key={index} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                                <td className="px-5 py-2.5 font-medium text-gray-800 w-full">{item.criterion}</td>
                                <td className="px-3 py-2.5 text-right text-gray-700 tabular-nums whitespace-nowrap">
                                  {isOutsideLoanRow ? outsideLoanLabel : formattedValue}
                                </td>
                                {/* Earned score carries the weight; the max is
                                    deliberately smaller and lighter. */}
                                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                  {item.score == null ? (
                                    <span className="text-gray-400 italic text-xs">— / {item.max_score}</span>
                                  ) : (
                                    <span className="tabular-nums">
                                      <span className="font-bold text-gray-900 text-base">{item.score}</span>
                                      <span className="text-gray-400 text-xs"> / {item.max_score}</span>
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2.5">
                                  {item.progress == null ? (
                                    <span className="text-gray-400 italic text-xs">Pending</span>
                                  ) : (
                                    // Fixed-width track (not flex-1) so bars are
                                    // comparable row to row; the 0% track stays
                                    // visible because the rail is always drawn.
                                    <div className="flex items-center gap-2">
                                      <span className="block w-14 shrink-0 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                                        <span
                                          className="block bg-green-600 h-full rounded-full transition-all"
                                          style={{ width: `${Math.max(0, Math.min(100, Number(item.progress)))}%` }}
                                        />
                                      </span>
                                      <span className="text-[11px] font-semibold text-gray-500 tabular-nums w-9 text-right">
                                        {item.progress}%
                                      </span>
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-right">
                                  {/* Only the PLI row is editable. Every other
                                      criterion is derived from a ledger, so an
                                      override there would silently disagree
                                      with the books. */}
                                  {isOutsideLoanRow ? (
                                    <div className="inline-flex items-center gap-1">
                                      <button
                                        onClick={() => handleDeclareOutsideLoan(false)}
                                        disabled={busy}
                                        title="Record: no loan with another PLI (10 of 10)"
                                        className={`px-2 h-7 rounded-md border text-[11px] font-semibold focus:outline-none focus:ring-2 focus:ring-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                          declared === false
                                            ? "bg-green-600 text-white border-green-600"
                                            : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                                        }`}
                                      >
                                        No
                                      </button>
                                      <button
                                        onClick={() => handleDeclareOutsideLoan(true)}
                                        disabled={busy}
                                        title="Record: has a loan with another PLI (0 of 10)"
                                        className={`px-2 h-7 rounded-md border text-[11px] font-semibold focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                          declared === true
                                            ? "bg-red-600 text-white border-red-600"
                                            : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                                        }`}
                                      >
                                        Yes
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-300 cursor-not-allowed"
                                      disabled
                                      title="Derived from the ledger — not editable"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                      <span className="sr-only">{item.criterion} is not editable</span>
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Right: Total Score Card */}
                <div className="lg:col-span-1 min-w-0">
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h3 className="font-bold text-gray-900 text-base mb-4">Total Score</h3>

                    {/* Score and its meter share one block -- the caption sat
                        in a separate grey panel before, reading as unrelated
                        to the number above it. mb-3 not mb-6 for that reason. */}
                    <div className="text-center mb-3">
                      {memberData.migs_score == null ? (
                        <div className="inline-flex flex-col items-center">
                          <span className="text-5xl font-bold text-gray-300 leading-none">—</span>
                          <span className="text-[11px] text-gray-400 mt-2 uppercase tracking-wider">Pending score</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-baseline justify-center gap-1 tabular-nums">
                          <span className="text-5xl leading-none font-bold text-green-700">
                            {memberData.migs_score}
                          </span>
                          <span className="text-lg font-semibold text-gray-400">/ 100</span>
                        </div>
                      )}
                    </div>

                    <div className="mb-5">
                      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-green-600 h-full rounded-full transition-all"
                          style={{ width: `${Math.max(0, Math.min(100, Number(memberData.migs_score) || 0))}%` }}
                        ></div>
                      </div>
                      <p className="text-[11px] text-gray-500 text-center font-medium mt-1.5">
                        {memberData.migs_score == null
                          ? "Scoring engine pending"
                          : `${memberData.migs_score}% Complete`}
                      </p>
                    </div>

                    {/* The verdict and its explanation now sit inside one
                        tinted block, so the sentence reads as the result's
                        caption rather than as floating text beneath a pill. */}
                    <div className={`rounded-lg border px-4 py-3 text-center ${
                      memberData.migs_status == null
                        ? "bg-gray-50 border-gray-200"
                        : memberData.migs_status === "MIGS Qualified"
                        ? "bg-green-50 border-green-200"
                        : "bg-red-50 border-red-200"
                    }`}>
                      <p className={`inline-flex items-center gap-1.5 font-semibold text-sm ${
                        memberData.migs_status == null
                          ? "text-gray-500"
                          : memberData.migs_status === "MIGS Qualified"
                          ? "text-green-700"
                          : "text-red-700"
                      }`}>
                        {memberData.migs_status != null && (
                          <span className="leading-none">
                            {memberData.migs_status === "MIGS Qualified" ? "✓" : "○"}
                          </span>
                        )}
                        {memberData.migs_status == null ? "Not classified" : memberData.migs_status}
                      </p>
                      <p className="text-[11px] text-gray-500 mt-1">
                        {memberData.migs_status == null
                          ? "Awaiting MIGS scoring engine"
                          : memberData.migs_status === "MIGS Qualified"
                          ? "Member qualifies for MIGS"
                          : "Member does not qualify"}
                      </p>
                    </div>

                    <hr className="my-5 border-gray-200" />

                    <div>
                      <h4 className="font-bold text-gray-900 mb-2.5 text-xs uppercase tracking-wider">Actions</h4>
                      {/* Primary first: Finalize is the action this screen
                          exists for, Recalculate is the way back. */}
                      <div className="space-y-2">
                        <button
                          onClick={handleFinalizeScore}
                          disabled={busy}
                          className="w-full h-10 flex items-center justify-center gap-1.5 rounded-lg bg-green-600 text-white font-semibold text-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-1 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <span className="leading-none">✓</span>
                          {busy ? "Working…" : "Finalize Score"}
                        </button>
                        <button
                          onClick={handleRecalculate}
                          disabled={busy}
                          className="w-full h-10 flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white text-gray-700 font-semibold text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {busy ? "Working…" : "Recalculate"}
                        </button>
                      </div>
                      {toast && (
                        <div className={`mt-3 text-xs px-3 py-2 rounded-lg border ${
                          toast.kind === "error" ? "bg-red-50 text-red-700 border-red-200" :
                          toast.kind === "warning" ? "bg-orange-50 text-orange-700 border-orange-200" :
                          "bg-green-50 text-green-700 border-green-200"
                        }`}>
                          {toast.message}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
};

export default MIGSDetails;
