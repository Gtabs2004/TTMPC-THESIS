import { useCallback, useEffect, useState } from "react";
import { ChevronRight, ReceiptText, Search } from "lucide-react";
import { authHeaders } from "../../utils/authHeaders";
import TableStateRow from "../TableStateRow";
import Pagination from "../Pagination";
import ReceiptModal from "./ReceiptModal";
import { formatDateTime, formatMoney } from "./receiptView";

// Staff receipt lookup (BOD, Bookkeeper, Manager, Treasurer) — RECEIPT_SYSTEM_PLAN.md §4.
// Read-only: lists issued receipts from GET /api/receipts and opens one.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const PAGE_SIZE = 10;

const RECEIPT_TYPE_LABELS = {
  loan_payment: "Loan Payment",
  loan_release: "Loan Release",
  savings: "Savings",
  cbu: "CBU Deposit",
  membership_payment: "Membership Fee",
  cbu_payout: "CBU Exit Payout",
  isc: "Interest on Share Capital",
  grocery: "Grocery",
};

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary";
const labelClass = "flex flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-600";

export default function ReceiptLookup() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [memberInput, setMemberInput] = useState("");
  const [search, setSearch] = useState("");
  const [member, setMember] = useState("");
  const [type, setType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [openReceiptNo, setOpenReceiptNo] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setMember(memberInput.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, memberInput]);

  useEffect(() => { setPage(1); }, [search, member, type, dateFrom, dateTo]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
      if (search) params.set("search", search);
      if (member) params.set("member", member);
      if (type !== "all") params.set("source_type", type);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const res = await fetch(`${API_BASE_URL}/api/receipts?${params}`, {
        headers: { Accept: "application/json", ...(await authHeaders()) },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || "Couldn't load receipts.");
      setRows(payload.rows || []);
      setTotal(payload.total || 0);
    } catch (e) {
      setError(e.message || "Couldn't load receipts.");
    } finally {
      setLoading(false);
    }
  }, [page, search, member, type, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <label className={`${labelClass} col-span-2`}>
          Receipt no.
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="TTMPC-TR-2026-…"
              className={`${inputClass} pl-9 normal-case tracking-normal`}
            />
          </span>
        </label>
        <label className={`${labelClass} col-span-2`}>
          Member
          <input
            type="search"
            value={memberInput}
            onChange={(e) => setMemberInput(e.target.value)}
            placeholder="Name or membership ID"
            className={`${inputClass} normal-case tracking-normal`}
          />
        </label>
        <label className={`${labelClass} col-span-2 lg:col-span-2`}>
          Type
          <select value={type} onChange={(e) => setType(e.target.value)} className={`${inputClass} normal-case tracking-normal`}>
            <option value="all">All types</option>
            {Object.entries(RECEIPT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Issued from
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={`${inputClass} px-2`} />
        </label>
        <label className={labelClass}>
          Issued to
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={`${inputClass} px-2`} />
        </label>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {error ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <p className="text-sm text-gray-700">{error}</p>
            <button
              type="button"
              onClick={load}
              className="min-h-11 rounded-lg border border-gray-300 px-5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead>
                  <tr className="bg-primary-deep text-[11px] font-bold uppercase tracking-wider text-white">
                    <th className="px-5 py-4">Receipt no.</th>
                    <th className="px-5 py-4">Member</th>
                    <th className="px-5 py-4">Type</th>
                    <th className="px-5 py-4">Issued</th>
                    <th className="px-5 py-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <TableStateRow colSpan={5} label="Loading receipts…" />
                  ) : rows.length ? (
                    rows.map((r) => (
                      <tr
                        key={r.receipt_no}
                        tabIndex={0}
                        role="button"
                        aria-label={`Open receipt ${r.receipt_no}`}
                        onClick={() => setOpenReceiptNo(r.receipt_no)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setOpenReceiptNo(r.receipt_no);
                          }
                        }}
                        className="cursor-pointer border-b border-gray-100 hover:bg-gray-50 focus-visible:bg-gray-50"
                      >
                        <td className="px-5 py-4 font-mono text-xs font-semibold text-gray-900">{r.receipt_no}</td>
                        <td className="px-5 py-4">
                          <p className="text-sm font-semibold text-gray-900">{r.snapshot?.member?.name || "—"}</p>
                          <p className="text-xs text-gray-600">{r.snapshot?.member?.membership_id || ""}</p>
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-700">
                          {r.snapshot?.title || RECEIPT_TYPE_LABELS[r.source_type] || r.source_type}
                        </td>
                        <td className="px-5 py-4 text-xs font-medium text-gray-600">{formatDateTime(r.issued_at)}</td>
                        <td className="px-5 py-4">
                          <span className="flex items-center justify-end gap-2 text-sm font-bold tabular-nums text-gray-900">
                            {formatMoney(r.amount)}
                            <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden="true" />
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <TableStateRow colSpan={5} variant="empty" icon={ReceiptText} label="No receipts found." />
                  )}
                </tbody>
              </table>
            </div>
            {!loading && total > PAGE_SIZE ? (
              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            ) : null}
          </>
        )}
      </div>

      <ReceiptModal open={!!openReceiptNo} receiptNo={openReceiptNo} onClose={() => setOpenReceiptNo("")} />
    </>
  );
}
