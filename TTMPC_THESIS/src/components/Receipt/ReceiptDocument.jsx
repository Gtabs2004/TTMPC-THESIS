import { Check } from "lucide-react";
import { RECEIPT_DISCLAIMER, buildReceiptView } from "./receiptView";

// The receipt itself, as approved in the mockup (RECEIPT_SYSTEM_PLAN.md §7).
// No logo/cooperative header on screen; the PDF (receiptPdf.js) carries it.
// It stays light in dark mode on purpose: it is a document, and it should
// look the same as the PDF a member downloads or prints.
export default function ReceiptDocument({ receipt }) {
  const view = buildReceiptView(receipt);

  return (
    <article aria-label={`Receipt ${view.receiptNo}`} className="bg-[#F4F7F3] text-gray-900 px-5 pt-4 pb-6 flex flex-col gap-4">
      <section aria-label="Summary" className="flex flex-col items-center gap-1.5 pt-3 pb-5 text-center">
        <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <Check className="h-7 w-7 text-green-800" strokeWidth={2.6} />
        </span>
        <span className="mt-1.5 text-xs font-bold uppercase tracking-[0.08em] text-green-800">Completed</span>
        <span className="text-[15px] font-semibold text-gray-700">{view.title}</span>
        <span className="text-[40px] font-extrabold leading-tight tracking-tight tabular-nums">{view.amount}</span>
        {view.subtitle ? <span className="text-[13px] text-gray-600">{view.subtitle}</span> : null}
      </section>

      <div aria-hidden="true" className="-mx-1 border-t-2 border-dashed border-gray-300" />

      {view.groups.map((group) => (
        <section key={group.heading} className="rounded-2xl border border-gray-200 bg-white px-4 py-1">
          <h3 className="pt-3 pb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-gray-600">{group.heading}</h3>
          <dl>
            {group.rows.map((r, i) => (
              <div
                key={r.label}
                className={`flex items-baseline justify-between gap-4 py-2.5 ${i < group.rows.length - 1 ? "border-b border-gray-100" : ""}`}
              >
                <dt className="shrink-0 text-[13px] text-gray-600">{r.label}</dt>
                <dd
                  className={`m-0 text-right tabular-nums ${
                    r.strong
                      ? "text-[15px] font-extrabold text-member-green"
                      : r.mono
                        ? "break-all font-mono text-[13px] font-semibold"
                        : "text-[13px] font-semibold"
                  }`}
                >
                  {r.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      <p className="text-center text-[11px] leading-relaxed text-gray-600">{RECEIPT_DISCLAIMER}</p>
    </article>
  );
}
