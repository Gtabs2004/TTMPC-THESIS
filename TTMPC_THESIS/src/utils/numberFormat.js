// Live thousand-separator formatting for currency/amount inputs.
//
// Native <input type="number"> rejects commas outright, so a comma-formatted
// field must be type="text" (with inputMode="decimal" for a numeric mobile
// keyboard). `stripCommas` gives back the plain numeric string to store in
// state / send to the API; `formatWithCommas` is only ever used for what's
// shown in the input's `value`.

/**
 * Strips everything except digits and a single decimal point, returning a
 * plain numeric string (e.g. "1000.5") safe to store in state or submit to
 * the API. Never contains a comma.
 */
export function stripCommas(input) {
  if (input === null || input === undefined) return "";
  let value = String(input).replace(/[^\d.]/g, "");
  // Keep only the first decimal point; a pasted "1.000.50" collapses to "1.00050"
  // rather than being rejected outright.
  const firstDot = value.indexOf(".");
  if (firstDot !== -1) {
    value = value.slice(0, firstDot + 1) + value.slice(firstDot + 1).replace(/\./g, "");
  }
  return value;
}

/**
 * Formats a plain numeric string with thousand-separator commas on the
 * integer part. Safe to call on every keystroke: preserves a trailing
 * decimal point ("1000." -> "1,000.") and partial decimals ("1000.5" ->
 * "1,000.5") instead of waiting for a complete number, so the caret doesn't
 * fight the user mid-type.
 */
export function formatWithCommas(input) {
  const clean = stripCommas(input);
  if (clean === "") return "";
  const [wholePart, ...rest] = clean.split(".");
  const groupedWhole = wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (rest.length === 0) return groupedWhole;
  return `${groupedWhole}.${rest.join("")}`;
}
