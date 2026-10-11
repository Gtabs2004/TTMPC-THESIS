import jsPDF from "jspdf";
import { COOP_ADDRESS, COOP_NAME, LOGO_URL, RECEIPT_DISCLAIMER, buildReceiptView, formatDateTime } from "./receiptView";

// A5 portrait receipt (RECEIPT_SYSTEM_PLAN.md §6.5). Built from the same
// buildReceiptView() rows as the on-screen viewer, so both always match.

const GREEN = [29, 96, 33];
const INK = [17, 24, 39];
const MUTED = [75, 85, 99];
const RULE = [229, 231, 235];

let logoPromise = null;

// The logo as a data URL, loaded once. A missing logo never blocks the PDF.
function loadLogo() {
  if (!logoPromise) {
    logoPromise = fetch(LOGO_URL)
      .then((res) => (res.ok ? res.blob() : null))
      .then(
        (blob) =>
          blob &&
          new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          }),
      )
      .catch(() => null);
  }
  return logoPromise;
}

async function buildPdf(receipt) {
  const view = buildReceiptView(receipt, { symbol: "PHP " });
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const left = 12;
  const right = width - 12;

  // Header
  const logo = await loadLogo();
  let textX = left;
  if (logo) {
    try {
      doc.addImage(logo, "PNG", left, 10, 12, 12);
      textX = left + 15;
    } catch {
      textX = left;
    }
  }
  // The name wraps to two lines; keep it clear of "TRANSACTION RECEIPT" on the right.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...GREEN);
  const nameLines = doc.splitTextToSize(COOP_NAME, 58);
  doc.text(nameLines, textX, 13.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(COOP_ADDRESS, textX, 13.5 + nameLines.length * 3.6 + 0.6);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text("TRANSACTION RECEIPT", right, 14, { align: "right" });
  doc.setFont("courier", "normal");
  doc.setFontSize(8);
  doc.text(view.receiptNo, right, 19, { align: "right" });

  doc.setDrawColor(...GREEN);
  doc.setLineWidth(0.6);
  doc.line(left, 25, right, 25);

  // Summary band
  doc.setFillColor(244, 247, 243);
  doc.roundedRect(left, 29, right - left, 18, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(22, 101, 52);
  doc.text(`COMPLETED · ${view.title.toUpperCase()}`, left + 4, 35.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  if (view.subtitle) doc.text(view.subtitle, left + 4, 41, { maxWidth: 70 });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...INK);
  doc.text(view.amount, right - 4, 40.5, { align: "right" });

  // Sections
  let y = 54;
  for (const group of view.groups) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(group.heading.toUpperCase(), left, y);
    y += 2;
    for (const r of group.rows) {
      y += 5.2;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      doc.text(r.label, left, y);
      if (r.strong) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...GREEN);
      } else if (r.mono) {
        doc.setFont("courier", "bold");
        doc.setTextColor(...INK);
      } else {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...INK);
      }
      doc.text(String(r.value), right, y, { align: "right", maxWidth: 80 });
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.2);
      doc.line(left, y + 1.8, right, y + 1.8);
    }
    y += 8;
  }

  // Footer
  doc.setDrawColor(...RULE);
  doc.line(left, height - 14, right, height - 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(RECEIPT_DISCLAIMER, left, height - 9.5, { maxWidth: 80 });
  doc.text(`Generated ${formatDateTime(new Date())} · Page 1 of 1`, right, height - 9.5, { align: "right" });

  return { doc, fileName: `Receipt-${view.receiptNo || "TTMPC"}.pdf` };
}

export async function downloadReceiptPdf(receipt) {
  const { doc, fileName } = await buildPdf(receipt);
  doc.save(fileName);
}

// Opens the PDF in a new tab with the print dialog. The tab is opened before
// the PDF is built so the browser treats it as part of the click.
export async function printReceiptPdf(receipt) {
  const tab = window.open("", "_blank");
  const { doc } = await buildPdf(receipt);
  doc.autoPrint();
  const url = doc.output("bloburl");
  if (tab) {
    tab.location.href = url;
  } else {
    window.open(url, "_blank");
  }
}
