import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const REPORT_COLUMNS = [
  { key: "memberId", header: "Member ID" },
  { key: "memberName", header: "Member Name" },
  { key: "status", header: "Attendance Status" },
  { key: "remarks", header: "Remarks" },
  { key: "recordedAt", header: "Last Recorded Timestamp" },
];

const formatMeetingDate = (value) => {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${month}/${day}/${year}` : "—";
};

const formatTimestamp = (value) => {
  if (!value) return "—";
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? "—" : timestamp.toLocaleString();
};

const csvCell = (value) => {
  let cell = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(cell)) cell = `'${cell}`;
  return `"${cell.replace(/"/g, '""')}"`;
};

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};

const getFilename = (meetingDate, scope, extension) => {
  const date = String(meetingDate || "").slice(0, 10) || "undated";
  return `general-assembly-attendance-${date}-${scope}.${extension}`;
};

const getSummary = (rows) => {
  const present = rows.filter((row) => row.status === "Present").length;
  return { total: rows.length, present, absent: rows.length - present };
};

export async function exportGeneralAssemblyReport({ rows, allRows = rows, meetingDate, scope, format }) {
  const dateLabel = formatMeetingDate(meetingDate);
  const exportRows = rows.map((row) => ({
    memberId: row.membership_id || "—",
    memberName: row.full_name || "Unknown Member",
    status: row.status === "Present" ? "Present" : "Absent",
    remarks: row.remarks || "",
    recordedAt: formatTimestamp(row.recorded_at),
  }));
  const summary = getSummary(allRows);

  if (format === "csv") {
    const csv = [
      REPORT_COLUMNS.map((column) => column.header),
      ...exportRows.map((row) => REPORT_COLUMNS.map((column) => row[column.key])),
    ]
      .map((record) => record.map(csvCell).join(","))
      .join("\r\n");
    downloadBlob(
      new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
      getFilename(meetingDate, scope, "csv")
    );
    return;
  }

  if (format === "xlsx") {
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("GA Attendance");
    sheet.addRow(["Tubungan Teachers' Multi-Purpose Cooperative"]);
    sheet.addRow(["General Assembly Attendance Report"]);
    sheet.addRow(["GA Date", dateLabel]);
    sheet.addRow(["Total", summary.total, "Present", summary.present, "Absent", summary.absent]);
    sheet.addRow([]);
    const header = sheet.addRow(REPORT_COLUMNS.map((column) => column.header));
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E7A2A" } };
    exportRows.forEach((row) => {
      sheet.addRow(REPORT_COLUMNS.map((column) => row[column.key]));
    });
    sheet.columns = [
      { width: 20 },
      { width: 32 },
      { width: 20 },
      { width: 42 },
      { width: 28 },
    ];
    sheet.views = [{ state: "frozen", ySplit: 6 }];
    const buffer = await workbook.xlsx.writeBuffer();
    downloadBlob(
      new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      getFilename(meetingDate, scope, "xlsx")
    );
    return;
  }

  if (format === "pdf") {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(15);
    doc.setFont("helvetica", "bold");
    doc.text("TUBUNGAN TEACHERS' MULTI-PURPOSE COOPERATIVE", 148.5, 15, {
      align: "center",
    });
    doc.setFontSize(12);
    doc.text("GENERAL ASSEMBLY ATTENDANCE REPORT", 148.5, 22, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`GA Date: ${dateLabel}`, 14, 31);
    doc.text(
      `Total: ${summary.total}    Present: ${summary.present}    Absent: ${summary.absent}`,
      14,
      38
    );
    autoTable(doc, {
      startY: 44,
      head: [REPORT_COLUMNS.map((column) => column.header)],
      body: exportRows.map((row) => REPORT_COLUMNS.map((column) => row[column.key])),
      styles: { fontSize: 8, cellPadding: 2.5, overflow: "linebreak" },
      headStyles: { fillColor: [46, 122, 42] },
      columnStyles: {
        0: { cellWidth: 32 },
        1: { cellWidth: 55 },
        2: { cellWidth: 32 },
        3: { cellWidth: 75 },
        4: { cellWidth: 55 },
      },
      margin: { left: 14, right: 14 },
    });
    doc.save(getFilename(meetingDate, scope, "pdf"));
    return;
  }

  throw new Error(`Unsupported General Assembly export format: ${format}`);
}

export { formatMeetingDate };
