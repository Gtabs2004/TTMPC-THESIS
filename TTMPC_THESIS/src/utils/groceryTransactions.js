import { supabase } from "../supabaseClient";

const GROCERY_COLUMNS =
  "GroceryID,event_id,pos_member_ref,TransactionDate,GroceryAmount,Status";
const FETCH_PAGE_SIZE = 1000;
const FETCH_CONCURRENCY = 4;

export async function fetchGroceryTransactions() {
  const { count, error: countError } = await supabase
    .from("GROCERY_TRANSACTIONS")
    .select("GroceryID", { count: "exact", head: true })
    .eq("Status", "Completed");

  if (countError) throw countError;
  if (!count) return [];

  const rows = [];
  const batchSize = FETCH_PAGE_SIZE * FETCH_CONCURRENCY;

  for (let batchStart = 0; batchStart < count; batchStart += batchSize) {
    const requests = [];
    for (
      let start = batchStart;
      start < Math.min(batchStart + batchSize, count);
      start += FETCH_PAGE_SIZE
    ) {
      requests.push(
        supabase
          .from("GROCERY_TRANSACTIONS")
          .select(GROCERY_COLUMNS)
          .eq("Status", "Completed")
          .order("TransactionDate", { ascending: false })
          .range(start, Math.min(start + FETCH_PAGE_SIZE - 1, count - 1))
      );
    }

    const results = await Promise.all(requests);
    const failedResult = results.find((result) => result.error);
    if (failedResult?.error) throw failedResult.error;
    results.forEach((result) => rows.push(...(result.data || [])));
  }

  return rows;
}

export async function fetchMemberLookup() {
  const { data, error } = await supabase
    .from("member")
    .select("id, membership_id, first_name, last_name");
  if (error) throw error;

  const lookup = {};
  (data || []).forEach((m) => {
    if (m.id) lookup[m.id] = m;
    if (m.membership_id) lookup[m.membership_id] = m;
  });
  return lookup;
}

const localDateKey = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function toGroceryRow(transaction, memberLookup = {}) {
  const date = transaction.TransactionDate || "";
  const parsedDate = date ? new Date(date) : null;
  const member = memberLookup[transaction.pos_member_ref];
  const memberName = member
    ? `${member.first_name || ""} ${member.last_name || ""}`.trim()
    : "";
  return {
    id: transaction.GroceryID || "",
    memberId: transaction.pos_member_ref || "—",
    memberName: memberName || "Unknown member",
    posEventId: transaction.event_id || "—",
    transactionDate: date,
    dateKey: localDateKey(date),
    dateLabel: parsedDate && !Number.isNaN(parsedDate.getTime())
      ? parsedDate.toLocaleString()
      : "—",
    amount: Number(transaction.GroceryAmount || 0),
    payment: "Cash",
  };
}

const normalizeSearch = (value) => String(value || "").trim().toLocaleLowerCase();

export function filterGroceryRows(rows, { activeTab, search, month }) {
  const query = normalizeSearch(search);
  return rows.filter((row) => {
    if (activeTab === "Cash" && row.payment !== "Cash") return false;
    if (month && (!row.dateKey || row.dateKey.slice(0, 7) !== month)) return false;
    if (!query) return true;

    return [row.id, row.memberId, row.memberName, row.posEventId]
      .some((value) => normalizeSearch(value).includes(query));
  });
}

const csvCell = (value) => {
  let cell = String(value ?? "");
  if (typeof value === "string" && /^[\s]*[=+\-@]/.test(cell)) cell = `'${cell}`;
  return `"${cell.replace(/"/g, '""')}"`;
};

export function downloadGroceryCsv(rows) {
  const headers = [
    "Grocery ID",
    "Member ID",
    "Member Name",
    "POS Event ID",
    "Transaction Date",
    "Amount",
    "Payment",
  ];
  const csv = [
    headers,
    ...rows.map((row) => [
      row.id,
      row.memberId,
      row.memberName,
      row.posEventId,
      row.transactionDate,
      row.amount,
      row.payment,
    ]),
  ]
    .map((record) => record.map(csvCell).join(","))
    .join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `grocery-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
