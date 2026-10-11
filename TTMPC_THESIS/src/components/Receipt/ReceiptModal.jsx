import { useEffect, useState } from "react";
import { Download, Loader2, Printer, X } from "lucide-react";
import { authHeaders } from "../../utils/authHeaders";
import ReceiptDocument from "./ReceiptDocument";
import { downloadReceiptPdf, printReceiptPdf } from "./receiptPdf";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

// Reads a receipt; never writes anything. Pass either `receiptNo` or
// `source` ({ type, id }). 404 covers "doesn't exist" and "not yours to see".
async function fetchReceipt({ receiptNo, source }) {
  const path = receiptNo
    ? `/api/receipts/${encodeURIComponent(receiptNo)}`
    : `/api/receipts/by-source/${encodeURIComponent(source.type)}/${encodeURIComponent(source.id)}`;
  const res = await fetch(`${API_BASE_URL}${path}`, { headers: { Accept: "application/json", ...(await authHeaders()) } });
  const payload = await res.json().catch(() => ({}));
  if (res.status === 404) {
    const err = new Error("This receipt isn't available. It may not be issued yet, or it isn't yours to view.");
    err.notFound = true;
    throw err;
  }
  if (!res.ok) throw new Error(payload?.detail || "Couldn't load the receipt. Please try again.");
  return payload.receipt;
}

// Receipt viewer: a centred modal on PC, a full-screen sheet on a phone.
// `notice` is an optional line above the receipt (the cashier pop-up uses it).
export default function ReceiptModal({ open, receiptNo, source, notice, title = "Receipt", onClose }) {
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(""); // "download" | "print"
  const [attempt, setAttempt] = useState(0);

  const sourceKey = source ? `${source.type}/${source.id}` : "";

  useEffect(() => {
    if (!open || (!receiptNo && !sourceKey)) return undefined;
    let cancelled = false;
    setLoading(true);
    setError("");
    setReceipt(null);
    fetchReceipt({ receiptNo, source })
      .then((r) => { if (!cancelled) setReceipt(r); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // source is read through sourceKey so a new object with the same value doesn't refetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, receiptNo, sourceKey, attempt]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const run = async (kind) => {
    if (!receipt || busy) return;
    setBusy(kind);
    try {
      if (kind === "download") await downloadReceiptPdf(receipt);
      else await printReceiptPdf(receipt);
    } catch {
      setError("Couldn't create the PDF. Please try again.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[160] flex items-stretch justify-center bg-black/50 backdrop-blur-sm sm:items-start sm:overflow-y-auto sm:px-4 sm:py-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex w-full flex-col overflow-hidden bg-white shadow-2xl sm:max-h-[calc(100vh-4rem)] sm:max-w-[420px] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 py-2 pl-5 pr-2">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close receipt"
            className="flex h-11 w-11 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {notice ? (
          <p className="shrink-0 bg-amber-50 px-5 py-3 text-xs leading-relaxed text-amber-900">{notice}</p>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center gap-3 px-6 py-20 text-sm text-gray-600" role="status">
              <Loader2 className="h-6 w-6 animate-spin text-member-green" />
              Loading receipt…
            </div>
          ) : error && !receipt ? (
            <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
              <p className="text-sm text-gray-700">{error}</p>
              <button
                type="button"
                onClick={() => setAttempt((n) => n + 1)}
                className="min-h-11 rounded-lg border border-gray-300 px-5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Try again
              </button>
            </div>
          ) : receipt ? (
            <ReceiptDocument receipt={receipt} />
          ) : null}
        </div>

        {receipt ? (
          <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3">
            {error ? <p className="mb-2 text-center text-xs text-red-700">{error}</p> : null}
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => run("download")}
                disabled={!!busy}
                className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary-deep text-sm font-bold text-white hover:bg-member-green disabled:opacity-60"
              >
                {busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-[18px] w-[18px]" />}
                Download Receipt
              </button>
              <button
                type="button"
                onClick={() => run("print")}
                disabled={!!busy}
                className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                {busy === "print" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-[18px] w-[18px]" />}
                Print
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
