import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Receipt, Search } from "lucide-react";
import { authHeaders } from "../../utils/authHeaders";
import { useRealtimeRefetch } from "../../hooks/useRealtimeRefetch";
import { RT } from "../../lib/realtimeSync";
import TableStateRow from "../../components/TableStateRow";
import Pagination from "../../components/Pagination";
import ReceiptModal from "../../components/Receipt/ReceiptModal";

// Statement of Account → Transactions (RECEIPT_SYSTEM_PLAN.md §3.2).
// Every transaction on the member's account; a completed one opens its
// receipt. Reads only — opening a row never posts anything.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const PAGE_SIZE = 10;

const TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "loan", label: "Loan" },
  { value: "savings", label: "Savings" },
  { value: "cbu", label: "Capital Build-Up" },
  { value: "membership", label: "Membership" },
  { value: "grocery", label: "Grocery" },
];

const CATEGORY_LABEL = { cbu: "CBU", membership: "MEMBERSHIP", grocery: "GROCERY" };
const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "completed", label: "Completed" },
  { value: "on_credit", label: "On credit" },
  { value: "pending", label: "Pending" },
  { value: "rejected", label: "Rejected" },
];

const STATUS_CHIP = {
  completed: { label: "Completed", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  on_credit: { label: "On credit", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  pending: { label: "Pending", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  rejected: { label: "Rejected", className: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300" },
};

const formatPeso = (amount) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));

const formatAmount = (row) =>
  `${row.direction === "credit" ? "+" : "−"}₱${Number(row.amount || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDay = (day) => {
  if (!day) return "—";
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(d);
};

function StatusChip({ status }) {
  const chip = STATUS_CHIP[status] || STATUS_CHIP.pending;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${chip.className}`}>
      {chip.label}
    </span>
  );
}

// What a row without a receipt says when it's opened.
function noteFor(row) {
  if (row.status === "on_credit") {
    return {
      title: "Grocery purchase on credit",
      text: `This purchase was added to your account. Balance due: ${formatPeso(row.balance_due)}.`,
    };
  }
  if (row.status === "pending") {
    return {
      title: "Waiting for validation",
      text: "Your receipt will appear here once the Bookkeeper validates this transaction.",
    };
  }
  if (row.status === "rejected") {
    return {
      title: "This transaction was not posted",
      text: "The Bookkeeper rejected this entry, so nothing was posted to your account and no receipt was issued. Please contact the cashier if you have questions.",
    };
  }
  return {
    title: "Receipt not available yet",
    text: "This transaction is complete, but its receipt isn't available in the portal yet.",
  };
}

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 dark:border-mdark-border dark:bg-mdark-card dark:text-mdark-text";
const labelClass =
  "flex flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-mdark-text-secondary";

export default function MemberTransactionsTab({ initialReceiptNo = "", initialOpenId = "", onInitialHandled }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [groceryTotals, setGroceryTotals] = useState({ purchaseAmount: 0, balanceDue: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [openReceiptNo, setOpenReceiptNo] = useState(initialReceiptNo);
  const [note, setNote] = useState(null);
  const pendingOpenId = useRef(initialOpenId);

  // Search waits for the member to stop typing.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { setPage(1); }, [search, type, status, dateFrom, dateTo]);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
      if (search) params.set("search", search);
      if (type !== "all") params.set("type", type);
      if (status !== "all") params.set("status", status);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const res = await fetch(`${API_BASE_URL}/api/member/transactions?${params}`, {
        headers: { Accept: "application/json", ...(await authHeaders()) },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || "Couldn't load your transactions.");
      setRows(payload.rows || []);
      setTotal(payload.total || 0);
      setGroceryTotals({
        purchaseAmount: Number(payload.totals?.grocery_purchase_amount || 0),
        balanceDue: Number(payload.totals?.grocery_balance_due || 0),
      });
    } catch (e) {
      if (!silent) setError(e.message || "Couldn't load your transactions.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, search, type, status, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);
  useRealtimeRefetch(RT.LOANS, () => load({ silent: true }));
  useRealtimeRefetch(RT.SAVINGS, () => load({ silent: true }));
  useRealtimeRefetch(RT.CBU, () => load({ silent: true }));
  useRealtimeRefetch(RT.GROCERY, () => load({ silent: true }));

  const openRow = useCallback((row) => {
    if (row.status === "completed" && row.receipt_no) setOpenReceiptNo(row.receipt_no);
    else setNote({ row, ...noteFor(row) });
  }, []);

  // Coming from the dashboard with a row that has no receipt: show its note
  // once the list has loaded.
  useEffect(() => {
    if (!pendingOpenId.current || loading) return;
    const row = rows.find((r) => r.id === pendingOpenId.current);
    pendingOpenId.current = "";
    if (row) openRow(row);
    onInitialHandled?.();
  }, [rows, loading, openRow, onInitialHandled]);

  const onRowKey = (e, row) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openRow(row);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <p className="mb-6 text-sm font-medium text-gray-600 dark:text-mdark-text-secondary">
        Every transaction on your account. Select a completed one to view, download or print its receipt.
      </p>

      <dl className="mb-5 flex flex-wrap gap-x-8 gap-y-2 rounded-xl border border-gray-100 bg-white px-4 py-3 dark:border-mdark-border dark:bg-mdark-card">
        <div className="flex items-baseline gap-2">
          <dt className="text-xs font-semibold text-gray-600 dark:text-mdark-text-secondary">Grocery purchases · all time</dt>
          <dd className="text-sm font-bold tabular-nums text-gray-900 dark:text-mdark-text">{formatPeso(groceryTotals.purchaseAmount)}</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="text-xs font-semibold text-gray-600 dark:text-mdark-text-secondary">Grocery balance due</dt>
          <dd className="text-sm font-bold tabular-nums text-amber-700 dark:text-amber-300">{formatPeso(groceryTotals.balanceDue)}</dd>
        </div>
      </dl>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <label className={`${labelClass} col-span-2`}>
          Search
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Receipt or reference no."
              className={`${inputClass} pl-9 font-medium normal-case tracking-normal`}
            />
          </span>
        </label>
        <label className={labelClass}>
          Type
          <select value={type} onChange={(e) => setType(e.target.value)} className={`${inputClass} font-medium normal-case tracking-normal`}>
            {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className={labelClass}>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClass} font-medium normal-case tracking-normal`}>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <div className="col-span-2 grid grid-cols-2 gap-3 md:col-span-1">
          <label className={labelClass}>
            From
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={`${inputClass} px-2`} />
          </label>
          <label className={labelClass}>
            To
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={`${inputClass} px-2`} />
          </label>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-mdark-border dark:bg-mdark-card">
        {error ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <p className="text-sm text-gray-700 dark:text-mdark-text">{error}</p>
            <button
              type="button"
              onClick={() => load()}
              className="min-h-11 rounded-lg border border-gray-300 px-5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-mdark-border dark:text-mdark-text dark:hover:bg-mdark-elevated"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            {/* PC: table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-primary-deep text-[10px] font-extrabold uppercase tracking-wider text-white dark:bg-mdark-nav dark:text-mdark-text">
                    <th className="p-5">Date</th>
                    <th className="p-5">Description</th>
                    <th className="p-5">Category</th>
                    <th className="p-5">Status</th>
                    <th className="p-5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <TableStateRow colSpan={5} label="Loading your transactions…" />
                  ) : rows.length ? (
                    rows.map((row) => (
                      <tr
                        key={row.id}
                        tabIndex={0}
                        role="button"
                        aria-label={`${row.description}, ${STATUS_CHIP[row.status]?.label || row.status}, ${formatAmount(row)}`}
                        onClick={() => openRow(row)}
                        onKeyDown={(e) => onRowKey(e, row)}
                        className="cursor-pointer border-b border-gray-100 transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-2 focus-visible:outline-primary-deep dark:border-mdark-border dark:hover:bg-mdark-elevated/50"
                      >
                        <td className="p-5 text-xs font-medium text-gray-600 dark:text-mdark-text-secondary">{formatDay(row.day)}</td>
                        <td className="p-5">
                          <p className="text-sm font-bold text-gray-800 dark:text-mdark-text">{row.description}</p>
                          <p className="mt-0.5 font-mono text-xs text-gray-600 dark:text-mdark-text-secondary">
                            {row.receipt_no || (row.status === "pending" ? "Awaiting validation" : row.status === "rejected" ? "Not posted" : row.reference)}
                          </p>
                          {row.status === "on_credit" && Number(row.balance_due) > 0 ? (
                            <p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                              Balance due: {formatPeso(row.balance_due)}
                            </p>
                          ) : null}
                        </td>
                        <td className="p-5">
                          <span className="rounded bg-gray-100 px-2 py-1 text-[9px] font-extrabold tracking-wider text-gray-700 dark:bg-mdark-elevated dark:text-mdark-text-secondary">
                            {CATEGORY_LABEL[row.category] || row.category.toUpperCase()}
                          </span>
                        </td>
                        <td className="p-5"><StatusChip status={row.status} /></td>
                        <td className="p-5">
                          <span className="flex items-center justify-end gap-2">
                            <span className={`text-sm font-bold tabular-nums ${row.direction === "credit" ? "text-member-green dark:text-mdark-accent" : "text-gray-900 dark:text-mdark-text"}`}>
                              {formatAmount(row)}
                            </span>
                            <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden="true" />
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <TableStateRow colSpan={5} variant="empty" icon={Receipt} label="No transactions found." />
                  )}
                </tbody>
              </table>
            </div>

            {/* Phone: cards */}
            <div className="divide-y divide-gray-100 dark:divide-mdark-border md:hidden">
              {loading ? (
                <div className="py-10"><TableStateRow bare label="Loading your transactions…" /></div>
              ) : rows.length ? (
                rows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => openRow(row)}
                    className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-mdark-elevated/50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-gray-800 dark:text-mdark-text">{row.description}</span>
                      <span className="mt-1 flex items-center gap-2 text-xs text-gray-600 dark:text-mdark-text-secondary">
                        <StatusChip status={row.status} />
                        {formatDay(row.day)}
                      </span>
                      {row.status === "on_credit" && Number(row.balance_due) > 0 ? (
                        <span className="mt-1 block text-xs font-semibold text-amber-700 dark:text-amber-300">
                          Balance due: {formatPeso(row.balance_due)}
                        </span>
                      ) : null}
                    </span>
                    <span className={`shrink-0 text-sm font-bold tabular-nums ${row.direction === "credit" ? "text-member-green dark:text-mdark-accent" : "text-gray-900 dark:text-mdark-text"}`}>
                      {formatAmount(row)}
                    </span>
                  </button>
                ))
              ) : (
                <div className="py-10"><TableStateRow bare variant="empty" icon={Receipt} label="No transactions found." /></div>
              )}
            </div>

            {!loading && total > PAGE_SIZE ? (
              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            ) : null}
          </>
        )}
      </div>

      <ReceiptModal open={!!openReceiptNo} receiptNo={openReceiptNo} onClose={() => setOpenReceiptNo("")} />

      {note ? (
        <div className="fixed inset-0 z-[160] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setNote(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={note.title}
            className="flex w-full flex-col gap-3 rounded-t-2xl bg-white p-6 shadow-2xl sm:max-w-md sm:rounded-2xl dark:bg-mdark-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-gray-900 dark:text-mdark-text">{note.title}</h2>
            <p className="text-sm leading-relaxed text-gray-600 dark:text-mdark-text-secondary">{note.text}</p>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-xl bg-gray-50 px-4 py-3 text-sm dark:bg-mdark-card">
              <dt className="text-gray-600 dark:text-mdark-text-secondary">Transaction</dt>
              <dd className="text-right font-semibold text-gray-900 dark:text-mdark-text">{note.row.description}</dd>
              <dt className="text-gray-600 dark:text-mdark-text-secondary">Amount</dt>
              <dd className="text-right font-semibold text-gray-900 dark:text-mdark-text">{formatAmount(note.row)}</dd>
              <dt className="text-gray-600 dark:text-mdark-text-secondary">Date</dt>
              <dd className="text-right font-semibold text-gray-900 dark:text-mdark-text">{formatDay(note.row.day)}</dd>
            </dl>
            <button
              type="button"
              onClick={() => setNote(null)}
              className="mt-1 min-h-11 self-end rounded-lg bg-primary-deep px-6 text-sm font-bold text-white hover:bg-member-green"
            >
              OK
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
