import React, { useEffect, useState, useRef } from "react";
import { useRealtimeVersion } from "../../hooks/useRealtimeRefetch";
import { RT } from "../../lib/realtimeSync";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Lock } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

// Membership record, view-only. The Secretary reads records here; nothing is
// edited. Termination is recorded by the BOD account administrator in
// Account Management and shows up in Section 3.

const formatDate = (value) => {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
};

const peso = (value) =>
  value == null || value === ""
    ? ""
    : `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function ReadOnlyField({ label, value, hint, placeholder = "—" }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-600 mb-2">{label}</label>
      <input
        type="text"
        value={value ?? ""}
        placeholder={placeholder}
        readOnly
        disabled
        className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
      />
      {hint ? <p className="text-xs text-gray-500 mt-1">{hint}</p> : null}
    </div>
  );
}

const Record_Details = ({ backPath = '/Secretary_Records' }) => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [record, setRecord] = useState(null);

  const rtVersion = useRealtimeVersion(RT.MEMBERS);
  const rtSeen = useRef(rtVersion);
  useEffect(() => {
    const silent = rtSeen.current !== rtVersion;
    rtSeen.current = rtVersion;
    async function loadDetails() {
      if (!id) return;
      if (!silent) setLoading(true);
      if (!silent) setError("");
      try {
        const response = await fetch(`${API_BASE_URL}/api/secretary/membership-records/${encodeURIComponent(id)}`, {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.detail || payload?.message || "Failed to load record details.");
        }
        setRecord(payload.data || {});
      } catch (err) {
        if (silent) return;
        setError(err?.message || "Unable to load record details.");
      } finally {
        if (!silent) setLoading(false);
      }
    }

    loadDetails();
  }, [id, rtVersion]);

  const r = record || {};
  const status = String(r.member_status || "active").toLowerCase();
  // Closed = terminated and CBU fully settled; exiting = CBU applied to loans,
  // leaves once the rest is paid. Both show the termination section.
  const terminated = status === "terminated" || status === "closed";
  const STATUS = {
    active: { label: "Active", className: "bg-green-50 text-green-700" },
    exiting: { label: "Exiting — balance due", className: "bg-amber-50 text-amber-800" },
    terminated: { label: "Terminated", className: "bg-red-50 text-red-700" },
    closed: { label: "Closed", className: "bg-gray-100 text-gray-700" },
  }[status] || { label: "Active", className: "bg-green-50 text-green-700" };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-4xl">
        <button
          onClick={() => navigate(backPath)}
          className="flex items-center gap-2 text-green-700 font-semibold hover:text-green-800 mb-6 transition-colors"
        >
          <ChevronLeft size={20} />
          Back to Membership Records
        </button>

        <div className="bg-white rounded-lg shadow-sm p-8">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
            <h1 className="text-3xl font-bold text-gray-800">{r.name || "Membership Record"}</h1>
            {record ? (
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS.className}`}>
                {STATUS.label}
              </span>
            ) : null}
          </div>

          {loading ? (
            <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">Loading record details...</div>
          ) : null}

          {error ? (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}

          <div className="mb-6 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            <Lock className="h-4 w-4 shrink-0 text-gray-400" />
            Membership records are view-only.
          </div>

          {/* Section 1: Membership Information */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-700 mb-4">Section 1: Membership Information</h2>
            <div className="grid grid-cols-3 gap-6">
              <ReadOnlyField label="Membership Number" value={r.membership_number} />
              <ReadOnlyField label="Date of Membership" value={formatDate(r.date_of_membership)} />
              <ReadOnlyField label="BOD Resolution Number" value={r.bod_resolution_number} />
            </div>
          </div>

          {/* Section 2: Initial Capital Subscription */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-700">Section 2: Initial Capital Subscription</h2>
              <span className="text-xs font-semibold text-gray-400 uppercase">Share Capital</span>
            </div>
            <div className="grid grid-cols-3 gap-6">
              <ReadOnlyField label="Number of Shares" value={r.number_of_shares} hint="Auto-computed from CBU balance" />
              <ReadOnlyField label="Amount (₱)" value={r.amount} hint="Auto-computed from CBU balance" />
              <ReadOnlyField label="Initial Paid-up Capital (₱)" value={r.initial_paid_up_capital} hint="Set once from first CBU payment" />
            </div>
          </div>

          {/* Section 3: Termination of Membership */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-700">Section 3: Termination of Membership</h2>
              <span className="text-xs font-semibold text-gray-400 uppercase">{STATUS.label}</span>
            </div>
            {terminated ? (
              <>
                <div className="grid grid-cols-2 gap-6">
                  <ReadOnlyField label="Termination BOD Resolution Number" value={r.termination_resolution_number} />
                  <ReadOnlyField label="Effective Date" value={formatDate(r.termination_date)} />
                  <ReadOnlyField label="Reason" value={r.termination_reason} />
                  <ReadOnlyField label="CBU at Termination" value={peso(r.termination_cbu_total)} />
                  <ReadOnlyField label="CBU Applied to Loans" value={peso(r.cbu_applied_to_loans ?? 0)} />
                  <ReadOnlyField label="CBU Paid Out" value={peso(r.cbu_paid_out ?? 0)} hint="Handed to the member by the Cashier" />
                  <ReadOnlyField label="CBU Still Owed to Member" value={peso(r.cbu_remaining ?? 0)} hint={status === "closed" ? "Fully settled — membership closed" : undefined} />
                </div>
                {r.termination_notes ? (
                  <div className="mt-6">
                    <ReadOnlyField label="Notes" value={r.termination_notes} />
                  </div>
                ) : null}
              </>
            ) : status === "exiting" ? (
              <>
                <p className="mb-4 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  This member&apos;s CBU was applied to their loans. They leave the cooperative automatically once the remaining loan balance is paid.
                </p>
                <div className="grid grid-cols-2 gap-6">
                  <ReadOnlyField label="Reason" value={r.termination_reason} />
                  <ReadOnlyField label="CBU Applied to Loans" value={peso(r.cbu_applied_to_loans ?? 0)} />
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                No termination on record. Terminations are recorded by the BOD in Account Management.
              </p>
            )}
          </div>

          <div className="flex justify-end mt-10 pt-6 border-t border-gray-200">
            <button
              onClick={() => navigate(backPath)}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Record_Details;
