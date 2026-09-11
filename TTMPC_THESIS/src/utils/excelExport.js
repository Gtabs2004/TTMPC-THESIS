// Shared helpers for the ISC Distribution / ISC Journal ".xlsx" exports
// (Bookkeeper/Components/ISC_Distribution.jsx and ISC_Journal.jsx). Kept in
// one place so both files stay visually identical instead of drifting apart
// hex-by-hex.

// Mirrors DESIGN.md's palette: Cooperative Green — Deep for real text/fills
// (base Primary fails the 4.5:1 body-text contrast — see the Text-on-Green
// Rule), the soft border tone for zebra rows and hairline dividers.
export const BRAND_GREEN = "FF2E7A2A";
export const BAND_FILL = "FFF3F4F6";
export const BORDER_SOFT = "FFE5E7EB";
export const PESO_FORMAT = '"₱"#,##0.00';

// Excel column letter for a 1-indexed column number (1 -> A, 27 -> AA, ...).
export const colLetter = (n) => {
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

export const downloadWorkbook = async (workbook, filename) => {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};
