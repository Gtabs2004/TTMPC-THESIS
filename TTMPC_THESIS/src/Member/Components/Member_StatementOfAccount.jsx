import React, { useEffect, useLayoutEffect, useMemo, useState, useRef } from "react";
import { useNavigate, NavLink, useSearchParams } from "react-router-dom";
import { useMemberSettings } from "../../contex/MemberSettingsContext";
import { useRealtimeVersion, useRealtimeRefetch } from "../../hooks/useRealtimeRefetch";
import { RT } from "../../lib/realtimeSync";
import { getLoanTypeCardStyle } from "../../utils/loanTypeColors";

// loanTypeColors.js is shared with 9 staff-portal files — its own comment
// notes the dark: classes baked into `ring`/`chip`/etc. are meant as inert
// extras for portals that never toggle dark mode, not tuned for an actual
// dark UI. Editing that file risks a staff page picking up a Member-tuned
// color in the rare case .dark leaks across portals (the toggle persists via
// localStorage, not per-tab sessionStorage). So it stays untouched, and this
// page layers its own Member-dark border color on top instead for just the
// full-card border — the one place the shared hue read as too loud wrapping
// an entire card (vs. the small icon badge/pill, which stay as shared,
// semantic color is the right call there). Inferred from the light-mode
// class the shared util already resolved to, so no need to duplicate its
// loan-type keyword matching here.
const memberDarkCardRing = (ringClass) => {
  if (ringClass.includes("green")) return "dark:border-mdark-accent/30";
  if (ringClass.includes("red")) return "dark:border-red-900/50";
  if (ringClass.includes("blue")) return "dark:border-blue-900/50";
  if (ringClass.includes("indigo")) return "dark:border-indigo-900/50";
  return "dark:border-mdark-border";
};
const lightRingOnly = (ringClass) => ringClass.replace(/\s*dark:\S+/g, "").trim();
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { supabase } from "../../supabaseClient";
import { resolveMemberIdentity } from "../../utils/memberIdentity";
import { authHeaders } from "../../utils/authHeaders";
import { sortCbuRowsAscending } from "../../utils/cbuOrdering";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import TableStateRow from "../../components/TableStateRow";
import MemberTransactionsTab from "./MemberTransactionsTab";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Activity,
  Search,
  Bell,
  History,
  User,
  Download,
  Receipt,
  ArrowLeft,
  ChevronRight,
  Banknote,
  Settings,
  Scroll,
  Wallet,
  PiggyBank,
  AlertTriangle,
  Sparkles,
  CalendarClock,
} from "lucide-react";
import PassbookBadge from "../../components/Savings/PassbookBadge";
import InterestFormulaTooltip from "../../components/Savings/InterestFormulaTooltip";

const styles = `
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px);} to { opacity: 1; transform: translateY(0);} }
  .animate-fade-in-up { animation: fadeInUp 0.6s ease-out; }
  tbody tr { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
  tbody tr:hover { transform: translateX(2px); }
`;

const ALLOWED_TYPES = ["consolidated", "emergency", "bonus"];
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const StatusBadge = ({ row }) => {
  const tone =
    row.status === "Paid" || row.status === "Prepaid"
      ? "bg-green-50 text-green-700 dark:bg-mdark-accent/15 dark:text-mdark-accent"
      : row.status === "Partial"
        ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
        : row.status === "Carried"
          ? "bg-gray-100 text-gray-600 dark:bg-mdark-elevated dark:text-mdark-text-secondary"
      : row.status === "Overdue"
        ? "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"
        : row.status === "Due Next"
          ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
          : "bg-gray-100 text-gray-600 dark:bg-mdark-elevated dark:text-mdark-text-secondary";
  const label = row.status === "Overdue" ? `Overdue · ${row.daysPastDue}d`
    : row.status === "Partial" ? "Partial payment"
    : row.status === "Carried" ? "Not paid · carried forward"
    : row.status === "Prepaid" ? "Settled by advance credit" : row.status;
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${tone}`}>
      {label}
    </span>
  );
};

const formatCurrency = (value) =>
  `₱${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// `capital_added` (unlike the savings ledger's `amount` + `entry_type` pair)
// is a single signed field — a correction/reversal row can carry a negative
// value. formatCurrency() already embeds "-" for a negative number, so a
// hardcoded "+" in front produced "+₱-1,479.91" instead of "-₱1,479.91".
// This picks the sign from the actual value instead of assuming it's always
// an addition.
const formatSignedCurrency = (value) => {
  const n = Number(value || 0);
  return `${n < 0 ? "-" : "+"}${formatCurrency(Math.abs(n))}`;
};

const formatCurrencyPdf = (value) =>
  `PHP ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value) => {
  if (!value) return "N/A";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
};

const classifyType = (name) => {
  const raw = String(name || "").toLowerCase();
  if (raw.includes("consolidated")) return "consolidated";
  if (raw.includes("emergency")) return "emergency";
  if (raw.includes("bonus")) return "bonus";
  return null;
};

const isReleasedLoan = (status) =>
  ["released", "disbursed", "partially paid", "paid", "fully paid", "completed", "closed"].includes(
    String(status || "").trim().toLowerCase()
  );

const humanizeSource = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "Capital Contribution";
  return raw
    .toLowerCase()
    .split("_")
    .map((word) => (word === "cbu" ? "CBU" : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
};

const STATEMENT_TABS = [
  { key: "loan", label: "Loan" },
  { key: "savings", label: "Savings" },
  { key: "time-deposits", label: "Time Deposits" },
  { key: "transactions", label: "Transactions" },
  { key: "cbu", label: "Capital Build-Up", shortLabel: "CBU" },
];

const tdProgress = (placement) => {
  const placed = new Date(placement.placement_date);
  const matures = new Date(placement.maturity_date);
  const totalDays = Math.max(1, Math.round((matures - placed) / 86400000));
  const elapsedDays = Math.min(
    totalDays,
    Math.max(0, Math.round((Date.now() - placed.getTime()) / 86400000))
  );
  const percent = Math.min(100, Math.max(0, Math.round((elapsedDays / totalDays) * 100)));
  return { totalDays, elapsedDays, percent };
};

const Member_StatementOfAccount = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const { openSettings } = useMemberSettings();
  const { addNotification } = useNotification();

  const [loans, setLoans] = useState([]);
  const [loadingLoans, setLoadingLoans] = useState(true);
  const [loanError, setLoanError] = useState("");

  const [selectedLoan, setSelectedLoan] = useState(null);
  const [rows, setRows] = useState([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [rowsError, setRowsError] = useState("");
  // Installments still owed (overdue + upcoming) from member_loan_schedule_position.
  const [positionRows, setPositionRows] = useState([]);
  // Months closed without a payment (roll-forward): their amount was carried
  // into the next bill. Shown as history so the statement has no gaps.
  const [carriedRows, setCarriedRows] = useState([]);

  const [memberLabel, setMemberLabel] = useState("Member");
  const [accountNumber, setAccountNumber] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [memberId, setMemberId] = useState(null);

  // ?tab=transactions opens the Transactions tab; &receipt= / &open= come from
  // the dashboard's Recent Transaction and open that row straight away.
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() =>
    STATEMENT_TABS.some((t) => t.key === searchParams.get("tab")) ? searchParams.get("tab") : "loan"
  );
  // Sliding underline: measure the active tab and animate one indicator to it.
  const tabRefs = useRef({});
  const [tabIndicator, setTabIndicator] = useState(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = tabRefs.current[activeTab];
      if (el) setTabIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeTab]);
  const [initialReceiptNo] = useState(() => searchParams.get("receipt") || "");
  const [initialOpenId] = useState(() => searchParams.get("open") || "");
  // Read once, then drop them from the URL so a refresh doesn't reopen the receipt.
  useEffect(() => {
    if (searchParams.get("receipt") || searchParams.get("open")) {
      setSearchParams({ tab: "transactions" }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [savingsLoaded, setSavingsLoaded] = useState(false);
  const [loadingSavings, setLoadingSavings] = useState(false);
  const [savingsError, setSavingsError] = useState("");
  const [regularSavings, setRegularSavings] = useState(0);
  const [savingsRows, setSavingsRows] = useState([]);
  // Savings Interest v2 (SAVINGS_INTEREST_V2_PLAN.md): per-account passbook
  // breakdown (accrued line interest) + current rate, keyed by account_number
  // so the ledger table can look up each row's accrued interest by ledger id.
  const [interestByLedgerId, setInterestByLedgerId] = useState(new Map());
  const [interestRate, setInterestRate] = useState(0.01);
  const [interestPreview, setInterestPreview] = useState(null);
  const [ytdInterestEarned, setYtdInterestEarned] = useState(0);

  const [cbuLoaded, setCbuLoaded] = useState(false);
  const [loadingCbu, setLoadingCbu] = useState(false);
  // Realtime: Savings/CBU tabs load once; clearing the flag reloads the
  // open tab (or the next time it's opened).
  useRealtimeRefetch(RT.SAVINGS, () => setSavingsLoaded(false));
  useRealtimeRefetch(RT.CBU, () => setCbuLoaded(false));
  const [cbuError, setCbuError] = useState("");
  const [cbuRows, setCbuRows] = useState([]);

  const [tdLoaded, setTdLoaded] = useState(false);
  const [loadingTd, setLoadingTd] = useState(false);
  const [tdError, setTdError] = useState("");
  const [tdPlacements, setTdPlacements] = useState([]);
  useRealtimeRefetch(RT.SAVINGS, () => setTdLoaded(false));

  const menuItems = [
      { name: "Dashboard", label: "Dashboard", icon: LayoutDashboard },
      { name: "Apply for Loan", label: "Apply", icon: Scroll },
      { name: "My Loans", label: "Loans", icon: Activity },
      { name: "Statement of Account", label: "Statement", icon: Receipt },
      { name: "Member Profile", label: "Profile", icon: Users },
    ];

  const routeMap = {
              "Dashboard": "/member-dashboard",
              "Apply for Loan": "/member-apply-loans",
              "My Loans": "/member-loans",
              "Statement of Account": "/member-statement-of-account",
              "Member Profile": "/members-profile", 
              
            };

  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      await signOut();
      navigate("/memberlogin", { replace: true });
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  const rtVersionLoans = useRealtimeVersion(RT.LOANS);
  const rtSeenLoans = useRef(rtVersionLoans);
  useEffect(() => {
    const silent = rtSeenLoans.current !== rtVersionLoans;
    rtSeenLoans.current = rtVersionLoans;
    let isMounted = true;

    const fetchLoans = async () => {
      try {
        if (!silent) setLoadingLoans(true);
        if (!silent) setLoanError("");

        const { memberId: mId, fullName, avatarUrl: signedAvatarUrl, memberRow, account } = await resolveMemberIdentity();
        if (!mId) throw new Error("Please sign in again to load your loans.");

        const { data, error: fetchError } = await supabase
          .from("loans")
          .select(`
            control_number,
            loan_amount,
            principal_amount,
            interest_rate,
            total_interest,
            monthly_amortization,
            term,
            loan_status,
            application_date,
            loan_type:loan_type_id ( name )
          `)
          .eq("member_id", mId)
          .order("application_date", { ascending: false });

        if (fetchError) throw fetchError;

        const filtered = (data || [])
          .filter((loan) => isReleasedLoan(loan.loan_status))
          .map((loan) => {
            const typeName = loan.loan_type?.name || "";
            const kind = classifyType(typeName);
            return kind
              ? {
                  control_number: loan.control_number,
                  type: typeName,
                  kind,
                  principal: Number(loan.principal_amount ?? loan.loan_amount ?? 0),
                  totalInterest: Number(loan.total_interest ?? 0),
                  monthly: Number(loan.monthly_amortization ?? 0),
                  term: loan.term,
                  status: loan.loan_status,
                  applicationDate: loan.application_date,
                }
              : null;
          })
          .filter(Boolean);

        if (isMounted) {
          setLoans(filtered);
          setSelectedLoan((current) =>
            current && filtered.some((loan) => loan.control_number === current.control_number)
              ? current
              : null
          );
          setMemberLabel(fullName || "Member");
          setAccountNumber(memberRow?.membership_number_id || account?.user_id || "—");
          setAvatarUrl(signedAvatarUrl || "");
          setMemberId(mId);
        }
      } catch (err) {
        if (silent) return;
        if (isMounted) setLoanError(err.message || "Unable to load loans.");
      } finally {
        if (!silent) if (isMounted) setLoadingLoans(false);
      }
    };

    fetchLoans();
    return () => {
      isMounted = false;
    };
  }, [rtVersionLoans]);

  const rtVersionRows = useRealtimeVersion(RT.LOANS);
  const rtSeenRows = useRef(rtVersionRows);
  useEffect(() => {
    const silent = rtSeenRows.current !== rtVersionRows;
    rtSeenRows.current = rtVersionRows;
    if (!selectedLoan || !memberId) {
      setRows([]);
      setPositionRows([]);
      setCarriedRows([]);
      return;
    }
    let isMounted = true;

    const fetchRows = async () => {
      try {
        if (!silent) setLoadingRows(true);
        if (!silent) setRowsError("");
        const { data, error } = await supabase
          .from("member_statement_of_account")
          .select(
            "payment_id, control_number, payment_date, due_date, installment_no, payment_status, reference_id, principal_paid, interest_paid, deficiency, penalty, total_amount_paid, outstanding_balance, outstanding_principal"
          )
          .eq("member_id", memberId)
          .eq("control_number", selectedLoan.control_number)
          .order("payment_date", { ascending: true });

        if (error) throw error;
        if (isMounted) setRows(data || []);

        // Loan position is optional: a fully paid loan has no rows, and a
        // database without the v3 migration has no view. Neither should
        // hide the payment history above.
        const { data: posData, error: posError } = await supabase
          .from("member_loan_schedule_position")
          .select("installment_no, due_date, is_projected, principal_due, interest_due, amount_due, status, days_past_due, remaining_balance, unpaid_penalty")
          .eq("member_id", memberId)
          .eq("control_number", selectedLoan.control_number)
          .order("installment_no", { ascending: true });
        if (isMounted) setPositionRows(posError ? [] : posData || []);

        const { data: carriedData, error: carriedError } = await supabase
          .from("loan_schedules")
          .select("id, installment_no, due_date, expected_amount, expected_principal, expected_interest, schedule_status, applied_credit")
          .eq("loan_id", selectedLoan.control_number)
          // "paid" lowercase is a legacy-import spelling (Simulation findings
          // #29a) -- this is a DB query filter, so both cases must be listed
          // explicitly (can't .toLowerCase() a Postgres column here). Mirrors
          // Bookkeeper/Components/Loan-Ledger.jsx's existing list.
          .in("schedule_status", ["partially_paid", "Paid", "paid"])
          .order("installment_no", { ascending: true });
        if (isMounted) setCarriedRows(carriedError ? [] : carriedData || []);
      } catch (err) {
        if (silent) return;
        if (isMounted) setRowsError(err.message || "Unable to load payment history.");
      } finally {
        if (!silent) if (isMounted) setLoadingRows(false);
      }
    };

    fetchRows();
    return () => {
      isMounted = false;
    };
  }, [selectedLoan, memberId, rtVersionRows]);

  useEffect(() => {
    if (activeTab !== "savings" || savingsLoaded || !memberId) return;
    let isMounted = true;

    const fetchSavings = async () => {
      try {
        setLoadingSavings(true);
        setSavingsError("");

        const { data: accountRows, error: accountError } = await supabase
          .from("savings_accounts")
          .select("account_number, balance")
          .eq("member_id", memberId);

        if (accountError) throw accountError;

        const accountNumbers = (accountRows || []).map((r) => r.account_number);
        const total = (accountRows || []).reduce((sum, r) => sum + Number(r?.balance || 0), 0);

        let ledger = [];
        if (accountNumbers.length > 0) {
          const { data: ledgerRows, error: ledgerError } = await supabase
            .from("savings_ledger")
            .select("id, entry_type, amount, running_balance, reference, remarks, posted_at")
            .in("account_number", accountNumbers)
            .order("posted_at", { ascending: true });

          if (ledgerError) throw ledgerError;
          ledger = ledgerRows || [];
        }

        if (isMounted) {
          setRegularSavings(total);
          setSavingsRows(ledger);
          setSavingsLoaded(true);
        }

        // Interest passbook + YTD total, merged across every account the
        // member holds (most members have exactly one).
        if (accountNumbers.length > 0) {
          const headers = await authHeaders();
          const results = await Promise.all(
            accountNumbers.map(async (acctNo) => {
              const [passbookRes, previewRes] = await Promise.all([
                fetch(`${API_BASE_URL}/api/savings-interest/ledger/${encodeURIComponent(acctNo)}`, { headers }),
                fetch(`${API_BASE_URL}/api/savings-interest/preview/${encodeURIComponent(acctNo)}`, { headers }),
              ]);
              const passbookJson = await passbookRes.json().catch(() => ({}));
              const previewJson = await previewRes.json().catch(() => ({}));
              return {
                passbook: passbookRes.ok && passbookJson?.success ? passbookJson.data || [] : [],
                rate: passbookJson?.interest_rate,
                preview: previewRes.ok && previewJson?.success ? previewJson.data : null,
              };
            })
          );

          if (isMounted) {
            const map = new Map();
            let ytd = 0;
            const currentYear = new Date().getFullYear();
            let combinedPreview = null;
            results.forEach(({ passbook, rate, preview }) => {
              passbook.forEach((row) => {
                if (row.id) map.set(row.id, row);
                if (row.code === "Int." && row.interest_posted && new Date(row.date).getFullYear() === currentYear) {
                  ytd += Number(row.interest_posted);
                }
              });
              if (rate) setInterestRate(rate);
              if (preview && (!combinedPreview || preview.period_quarter < combinedPreview.period_quarter)) {
                combinedPreview = preview;
              }
            });
            setInterestByLedgerId(map);
            setYtdInterestEarned(ytd);
            setInterestPreview(combinedPreview);
          }
        }
      } catch (err) {
        if (isMounted) setSavingsError(err.message || "Unable to load savings statement.");
      } finally {
        setLoadingSavings(false);
      }
    };

    fetchSavings();
    return () => {
      isMounted = false;
    };
  }, [activeTab, memberId, savingsLoaded]);

  useEffect(() => {
    if (activeTab !== "cbu" || cbuLoaded || !memberId) return;
    let isMounted = true;

    const fetchCbu = async () => {
      try {
        setLoadingCbu(true);
        setCbuError("");

        const { data, error } = await supabase
          .from("capital_build_up")
          .select("id, cbu_deposit_id, transaction_date, starting_share_capital, capital_added, ending_share_capital, deposit_account")
          .eq("member_id", memberId);

        if (error) throw error;

        if (isMounted) {
          // Same-day rows (e.g. an ISC capitalization landing on the same date
          // as another CBU event) need a real tiebreak, not just date order —
          // see cbuOrdering.js.
          setCbuRows(sortCbuRowsAscending(data));
          setCbuLoaded(true);
        }
      } catch (err) {
        if (isMounted) setCbuError(err.message || "Unable to load capital build-up statement.");
      } finally {
        if (isMounted) setLoadingCbu(false);
      }
    };

    fetchCbu();
    return () => {
      isMounted = false;
    };
  }, [activeTab, memberId, cbuLoaded]);

  useEffect(() => {
    if (activeTab !== "time-deposits" || tdLoaded || !memberId) return;
    let isMounted = true;

    const fetchTimeDeposits = async () => {
      try {
        setLoadingTd(true);
        setTdError("");
        const headers = await authHeaders();
        const response = await fetch(`${API_BASE_URL}/api/member/time-deposits`, { headers });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) {
          throw new Error(payload.detail || "Unable to load Time Deposits.");
        }
        if (isMounted) {
          setTdPlacements(payload.data?.placements || []);
          setTdLoaded(true);
        }
      } catch (err) {
        if (isMounted) setTdError(err.message || "Unable to load Time Deposits.");
      } finally {
        if (isMounted) setLoadingTd(false);
      }
    };

    fetchTimeDeposits();
    return () => {
      isMounted = false;
    };
  }, [activeTab, memberId, tdLoaded]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        principal: acc.principal + Number(r.principal_paid || 0),
        interest: acc.interest + Number(r.interest_paid || 0),
        deficiency: acc.deficiency + Number(r.deficiency || 0),
        penalty: acc.penalty + Number(r.penalty || 0),
        paid: acc.paid + Number(r.total_amount_paid || 0),
      }),
      { principal: 0, interest: 0, deficiency: 0, penalty: 0, paid: 0 }
    );
  }, [rows]);

  // What the member owes right now. Every position row repeats the loan-level
  // remaining_balance / unpaid_penalty, so the first row carries them.
  const position = useMemo(() => {
    if (positionRows.length === 0) return null;
    const overdue = positionRows.filter((r) => r.status === "Overdue");
    const overdueAmount = overdue.reduce((s, r) => s + Number(r.amount_due || 0), 0);
    const penalty = Number(positionRows[0].unpaid_penalty || 0);
    return {
      remaining: Number(positionRows[0].remaining_balance || 0),
      overdueCount: overdue.length,
      overdueAmount,
      maxDaysPastDue: overdue.reduce((m, r) => Math.max(m, Number(r.days_past_due || 0)), 0),
      penalty,
      dueNow: overdueAmount + penalty,
      next: positionRows.find((r) => r.status !== "Overdue") || null,
    };
  }, [positionRows]);

  // One statement: what was paid (validated payments, oldest first), then
  // every installment still owed (overdue, then upcoming).
  const statementRows = useMemo(() => {
    const paidRows = [...rows]
      .sort((a, b) => String(a.payment_date).localeCompare(String(b.payment_date)))
      .map((r) => ({
        key: `p-${r.payment_id}`,
        // A payment on an installment that closed short (or a month later
        // rolled forward as missed) settled older arrears, not that month.
        status: String(r.payment_status || "").toLowerCase() === "partially_paid" ? "Partial" : "Paid",
        installment: r.installment_no,
        dueDate: r.due_date,
        paidOn: r.payment_date,
        reference: r.reference_id,
        principal: r.principal_paid,
        interest: r.interest_paid,
        penalty: r.penalty,
        amount: r.total_amount_paid,
        balance: r.outstanding_balance,
      }));
    // The first installment that isn't overdue is the one to pay this month --
    // unless an earlier overpayment's credit already covers it in full
    // (amount_due rolled to 0), in which case it's settled, not pending.
    const nextNo = positionRows.find((r) => r.status !== "Overdue")?.installment_no;
    const owedRows = positionRows.map((r) => ({
      key: `s-${r.installment_no}`,
      status: r.status === "Overdue"
        ? "Overdue"
        : r.installment_no === nextNo
        ? (Number(r.amount_due) <= 0 ? "Prepaid" : "Due Next")
        : "Not Yet Due",
      daysPastDue: r.days_past_due,
      installment: r.installment_no,
      dueDate: r.due_date,
      paidOn: null,
      reference: null,
      principal: r.principal_due,
      interest: r.interest_due,
      penalty: null,
      amount: r.amount_due,
      balance: null,
    }));
    // One timeline in installment order: a payment and the months it left
    // unpaid read top to bottom. Rows without an installment (legacy) by date.
    const order = (r) => (r.installment ?? Number.MAX_SAFE_INTEGER);
    // Closed months that had no payment of their own (a payment booked on a
    // short-paid month is already a "Partial payment" row above).
    const paidNos = new Set(paidRows.map((r) => r.installment));
    const carried = carriedRows
      .filter((s) => !paidNos.has(s.installment_no))
      .map((s) => ({
        key: `c-${s.installment_no}`,
        // Closed short (missed, shortfall rolled to the next bill) vs closed
        // by an earlier overpayment's credit covering it in full -- same
        // "no payment of its own" shape, different reason, so label them
        // differently rather than letting a credit-settled month vanish.
        // Case-insensitive: legacy-imported rows store "paid" lowercase
        // (Simulation findings #29a).
        status: String(s.schedule_status || "").toLowerCase() === "paid" ? "Prepaid" : "Carried",
        installment: s.installment_no,
        dueDate: s.due_date,
        paidOn: null,
        reference: null,
        principal: s.expected_principal,
        interest: s.expected_interest,
        penalty: null,
        amount: String(s.schedule_status || "").toLowerCase() === "paid" ? 0 : s.expected_amount,
        balance: null,
      }));
    return [...paidRows, ...carried, ...owedRows].sort((a, b) =>
      order(a) - order(b) || String(a.paidOn || "").localeCompare(String(b.paidOn || ""))
    );
  }, [rows, positionRows, carriedRows]);

  const statementCounts = useMemo(() => ({
    paid: rows.length,
    overdue: positionRows.filter((r) => r.status === "Overdue").length,
    upcoming: positionRows.filter((r) => r.status !== "Overdue").length,
  }), [rows, positionRows]);

  const owedTotals = useMemo(() => positionRows.reduce(
    (acc, r) => ({
      principal: acc.principal + Number(r.principal_due || 0),
      interest: acc.interest + Number(r.interest_due || 0),
      amount: acc.amount + Number(r.amount_due || 0),
    }),
    { principal: 0, interest: 0, amount: 0 }
  ), [positionRows]);

  // Balance after the most recent payment; before any payment, the full position.
  const latestBalance = useMemo(() => {
    const sorted = [...rows].sort((a, b) => String(a.payment_date).localeCompare(String(b.payment_date)));
    const last = sorted[sorted.length - 1];
    if (last) return Number(last.outstanding_balance || 0);
    return position ? position.remaining : 0;
  }, [rows, position]);


  const savingsTotals = useMemo(() => {
    return savingsRows.reduce(
      (acc, r) => {
        const isCredit = String(r?.entry_type || "").toLowerCase() === "credit";
        const amount = Number(r?.amount || 0);
        return {
          credits: acc.credits + (isCredit ? amount : 0),
          debits: acc.debits + (isCredit ? 0 : amount),
        };
      },
      { credits: 0, debits: 0 }
    );
  }, [savingsRows]);

  const cbuTotals = useMemo(() => {
    return cbuRows.reduce(
      (acc, r) => ({ added: acc.added + Number(r?.capital_added || 0) }),
      { added: 0 }
    );
  }, [cbuRows]);

  const handleDownloadPdf = () => {
    if (!selectedLoan) return;
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const generatedOn = new Date().toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(29, 96, 33);
    doc.text("TTMPC - Statement of Account", 40, 50);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(`Member Name: ${memberLabel}`, 40, 72);
    doc.text(`Account Number: ${accountNumber}`, 40, 88);
    doc.text(`Loan Type: ${selectedLoan.type}`, 40, 104);
    doc.text(`Loan Control No.: ${selectedLoan.control_number}`, 40, 120);
    doc.text(`Generated On: ${generatedOn}`, pageWidth - 40, 72, { align: "right" });

    doc.setDrawColor(220, 220, 220);
    doc.line(40, 132, pageWidth - 40, 132);

    autoTable(doc, {
      startY: 145,
      head: [[
        "#",
        "Due Date",
        "Paid On",
        "Reference ID",
        "Principal",
        "Interest",
        "Penalty",
        "Amount",
        "Status",
        "Balance After",
      ]],
      body: statementRows.map((r) => {
        const paid = r.status === "Paid" || r.status === "Partial";
        return [
          r.installment ?? "-",
          r.dueDate ? formatDate(r.dueDate) : "-",
          r.paidOn ? formatDate(r.paidOn) : "-",
          r.reference || "-",
          formatCurrencyPdf(r.principal),
          formatCurrencyPdf(r.interest),
          paid ? formatCurrencyPdf(r.penalty) : "-",
          formatCurrencyPdf(r.amount),
          r.status === "Overdue" ? `Overdue (${r.daysPastDue}d)` : r.status,
          paid ? formatCurrencyPdf(r.balance) : "-",
        ];
      }),
      styles: { fontSize: 8.5, cellPadding: 5, overflow: "linebreak", valign: "middle" },
      headStyles: { fillColor: [29, 96, 33], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 249, 251] },
      columnStyles: {
        0: { cellWidth: 28 },
        3: { cellWidth: 110 },
        4: { halign: "right" },
        5: { halign: "right" },
        6: { halign: "right" },
        7: { halign: "right" },
        9: { halign: "right" },
      },
      didParseCell: (data) => {
        // Overdue installments in red, so they stand out in print too.
        if (data.section === "body" && statementRows[data.row.index]?.status === "Overdue") {
          data.cell.styles.textColor = [200, 30, 30];
        }
      },
      margin: { left: 40, right: 40 },
    });

    // ===== TOTALS SECTION (rule + label + stacked figures on the right) =====
    const totalsGap = 22;                    // gap below table before the rule
    const sidePadding = 40;                  // page-edge padding (matches table margin)
    const totalsLabelX = 50;                 // x-position of "TOTALS" label
    const rightFigureRightPad = 50;          // distance from right edge to the right-aligned figures
    const totalsFontSize = 11;
    const lineSpacing = 16;                  // gap between stacked figures

    const totalsLines = [
      `Total Paid: ${formatCurrencyPdf(totals.paid)} (principal ${formatCurrencyPdf(totals.principal)}, interest ${formatCurrencyPdf(totals.interest)}, penalty ${formatCurrencyPdf(totals.penalty)})`,
      `Remaining Balance: ${formatCurrencyPdf(position ? position.remaining : latestBalance)}`,
    ];
    if (position) {
      totalsLines.push(
        `Overdue Amount: ${formatCurrencyPdf(position.overdueAmount)} (${position.overdueCount} installment${position.overdueCount === 1 ? "" : "s"})`,
        `Penalty Assessed: ${formatCurrencyPdf(position.penalty)}`,
        `Amount Due Now: ${formatCurrencyPdf(position.dueNow)}`,
      );
    }

    // Start the totals on a new page if they would run off this one.
    let ruleY = doc.lastAutoTable.finalY + totalsGap;
    if (ruleY + 18 + totalsLines.length * lineSpacing > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      ruleY = 50;
    }
    const totalsY = ruleY + 18;              // first text line, below the rule

    // Horizontal rule above the totals
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.75);
    doc.line(sidePadding, ruleY, pageWidth - sidePadding, ruleY);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(totalsFontSize);
    doc.setTextColor(29, 96, 33);

    // Left label
    doc.text("TOTALS", totalsLabelX, totalsY);

    totalsLines.forEach((line, i) => {
      doc.text(
        line,
        pageWidth - rightFigureRightPad,
        totalsY + i * lineSpacing,
        { align: "right" }
      );
    });

    const safeName = (memberLabel || "member").replace(/[^a-z0-9]+/gi, "_");
    const safeLoan = (selectedLoan.control_number || "loan").replace(/[^a-z0-9]+/gi, "_");
    doc.save(`SOA_${safeName}_${safeLoan}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handleDownloadSavingsPdf = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const generatedOn = new Date().toLocaleString("en-US", {
      year: "numeric", month: "long", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(29, 96, 33);
    doc.text("TTMPC - Savings Statement", 40, 50);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(`Member Name: ${memberLabel}`, 40, 72);
    doc.text(`Account Number: ${accountNumber}`, 40, 88);
    doc.text(`Generated On: ${generatedOn}`, pageWidth - 40, 72, { align: "right" });

    doc.setDrawColor(220, 220, 220);
    doc.line(40, 100, pageWidth - 40, 100);

    autoTable(doc, {
      startY: 113,
      head: [["Date", "Transaction Type", "Reference", "Amount", "Balance"]],
      body: savingsRows.map((r) => {
        const isCredit = String(r?.entry_type || "").toLowerCase() === "credit";
        const amount = Number(r?.amount || 0);
        return [
          formatDate(r.posted_at),
          r.remarks || (isCredit ? "Savings Deposit" : "Savings Withdrawal"),
          r.reference || "-",
          `${isCredit ? "+" : "-"}${formatCurrencyPdf(amount)}`,
          formatCurrencyPdf(r.running_balance),
        ];
      }),
      styles: { fontSize: 9, cellPadding: 6, overflow: "linebreak", valign: "middle" },
      headStyles: { fillColor: [29, 96, 33], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 249, 251] },
      columnStyles: { 3: { halign: "right" }, 4: { halign: "right" } },
      margin: { left: 40, right: 40 },
    });

    const finalY = doc.lastAutoTable.finalY + 22;
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.75);
    doc.line(40, finalY, pageWidth - 40, finalY);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(29, 96, 33);
    doc.text("TOTALS", 50, finalY + 18);
    [
      `Total Deposits: ${formatCurrencyPdf(savingsTotals.credits)}`,
      `Total Withdrawals: ${formatCurrencyPdf(savingsTotals.debits)}`,
      `Current Balance: ${formatCurrencyPdf(regularSavings)}`,
    ].forEach((line, i) => {
      doc.text(line, pageWidth - 50, finalY + 18 + i * 16, { align: "right" });
    });

    const safeName = (memberLabel || "member").replace(/[^a-z0-9]+/gi, "_");
    doc.save(`Savings_Statement_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handleDownloadCbuPdf = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const generatedOn = new Date().toLocaleString("en-US", {
      year: "numeric", month: "long", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(29, 96, 33);
    doc.text("TTMPC - Capital Build-Up Statement", 40, 50);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(`Member Name: ${memberLabel}`, 40, 72);
    doc.text(`Account Number: ${accountNumber}`, 40, 88);
    doc.text(`Generated On: ${generatedOn}`, pageWidth - 40, 72, { align: "right" });

    doc.setDrawColor(220, 220, 220);
    doc.line(40, 100, pageWidth - 40, 100);

    autoTable(doc, {
      startY: 113,
      head: [["Date", "Source", "Starting Share Capital", "Capital Added", "Ending Share Capital"]],
      body: cbuRows.map((r) => [
        formatDate(r.transaction_date),
        humanizeSource(r.deposit_account),
        formatCurrencyPdf(r.starting_share_capital),
        formatCurrencyPdf(r.capital_added),
        formatCurrencyPdf(r.ending_share_capital),
      ]),
      styles: { fontSize: 9, cellPadding: 6, overflow: "linebreak", valign: "middle" },
      headStyles: { fillColor: [29, 96, 33], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 249, 251] },
      columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
      margin: { left: 40, right: 40 },
    });

    const finalY = doc.lastAutoTable.finalY + 22;
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.75);
    doc.line(40, finalY, pageWidth - 40, finalY);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(29, 96, 33);
    doc.text("TOTALS", 50, finalY + 18);
    [
      `Total Capital Added: ${formatCurrencyPdf(cbuTotals.added)}`,
      `Ending Share Capital: ${formatCurrencyPdf(cbuRows[cbuRows.length - 1]?.ending_share_capital || 0)}`,
    ].forEach((line, i) => {
      doc.text(line, pageWidth - 50, finalY + 18 + i * 16, { align: "right" });
    });

    const safeName = (memberLabel || "member").replace(/[^a-z0-9]+/gi, "_");
    doc.save(`CBU_Statement_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="relative flex h-screen overflow-hidden bg-[#F8F9FA] dark:bg-mdark-bg">
      <style>{styles}</style>

      {/* Sidebar — desktop only. Mobile navigation is MemberMobileNav's fixed
          bottom bar, rendered once by MemberLayout for every Member route;
          this drawer duplicated the same links via a hamburger toggle. */}
      <aside
        className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-64 bg-white dark:bg-mdark-nav p-4 flex-col border-r border-gray-200 dark:border-mdark-border"
      >
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-primary">TTMPC</h1>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-mdark-text-secondary font-bold">Members Portal</p>
          </div>
        </div>

        <hr className="w-full border-gray-100 dark:border-mdark-border mb-6" />

        <nav className="flex grow flex-col gap-2 text-sm">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const to = routeMap[item.name];
            return (
              <NavLink
                key={item.name}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
                    isActive
                      ? "bg-[#EAF1EB] text-member-green font-bold dark:bg-mdark-accent/15 dark:text-mdark-accent"
                      : "text-gray-600 hover:bg-gray-50 hover:text-member-green font-medium dark:text-mdark-text-secondary dark:hover:bg-mdark-elevated dark:hover:text-mdark-accent"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                    <span>{item.name}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <button
          onClick={handleSignOut}
          className="mt-auto w-full rounded-lg p-2.5 text-sm bg-member-green hover:bg-[#154718] dark:bg-mdark-accent dark:hover:bg-mdark-accent/90 text-white font-bold transition-colors"
        >
          Sign out
        </button>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden lg:ml-64">
        <header className="bg-white dark:bg-mdark-nav h-16 shrink-0 shadow-sm flex items-center justify-between px-4 sm:px-6 lg:px-8 z-10 border-b border-gray-100 dark:border-mdark-border">
          <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-0">
            <h1 className="text-base sm:text-lg font-extrabold text-[#1a4a2f] dark:text-mdark-accent lg:hidden">Statement of Account</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            
            <LoanNotificationBell role="member" accentClass="bg-member-green dark:bg-mdark-accent" />
            <button
              type="button"
              onClick={openSettings}
              className="p-2 rounded-md text-gray-500 dark:text-mdark-text-secondary hover:bg-gray-100 dark:hover:bg-mdark-elevated transition-colors"
              aria-label="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main className="scrollbar-hidden animate-page-in p-4 sm:p-6 lg:p-8 overflow-y-auto pb-28 lg:pb-0 animate-fade-in-up">
          <h1 className="hidden lg:block font-extrabold text-[#1a4a2f] dark:text-mdark-accent text-2xl mb-2">Statement of Account</h1>
          <p className="text-sm text-gray-500 dark:text-mdark-text-secondary font-medium mb-6">
            Review your loan, savings, transactions, and capital build-up statements.
          </p>

          {/* Statement Tabs */}
          <div className="flex items-center gap-5 lg:gap-8 border-b border-gray-200 dark:border-mdark-border relative mb-8 overflow-x-auto scrollbar-hidden">
            {STATEMENT_TABS.map((tab) => (
              <button
                key={tab.key}
                ref={(el) => { tabRefs.current[tab.key] = el; }}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`shrink-0 whitespace-nowrap pb-3 text-sm font-bold transition-colors duration-300 ${
                  activeTab === tab.key
                    ? "text-member-green dark:text-mdark-accent"
                    : "text-gray-500 hover:text-gray-700 dark:text-mdark-text-secondary dark:hover:text-mdark-text"
                }`}
              >
                {tab.shortLabel ? (
                  <>
                    <span className="sm:hidden">{tab.shortLabel}</span>
                    <span className="hidden sm:inline">{tab.label}</span>
                  </>
                ) : (
                  tab.label
                )}
              </button>
            ))}
            {tabIndicator && (
              <span
                aria-hidden="true"
                className="absolute bottom-0 left-0 h-0.5 rounded-full bg-member-green dark:bg-mdark-accent transition-[transform,width] duration-300 ease-out"
                style={{ width: tabIndicator.width, transform: `translateX(${tabIndicator.left}px)` }}
              />
            )}
          </div>

          {activeTab === "loan" && (
          !selectedLoan ? (
            <>
              <p className="text-sm text-gray-500 dark:text-mdark-text-secondary font-medium mb-8">
                Select a loan to view its payment history and download the statement.
              </p>

              {loadingLoans ? (
                <div className="bg-white dark:bg-mdark-card rounded-2xl shadow-sm border border-gray-100 dark:border-mdark-border p-8 text-sm text-gray-500 dark:text-mdark-text-secondary">
                  Loading your loans…
                </div>
              ) : loanError ? (
                <div className="bg-white dark:bg-mdark-card rounded-2xl shadow-sm border border-gray-100 dark:border-mdark-border p-8 text-sm text-red-600">
                  {loanError}
                </div>
              ) : loans.length === 0 ? (
                <div className="bg-white dark:bg-mdark-card rounded-2xl shadow-sm border border-gray-100 dark:border-mdark-border p-8 text-sm text-gray-500 dark:text-mdark-text-secondary">
                  No Consolidated, Emergency, or Bonus loans found on your account.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                  {loans.map((loan) => {
                    const k = getLoanTypeCardStyle(loan.kind);
                    return (
                      <button
                        key={loan.control_number}
                        type="button"
                        onClick={() => setSelectedLoan(loan)}
                        className={`text-left bg-white dark:bg-mdark-card rounded-2xl shadow-sm border ${lightRingOnly(k.ring)} ${memberDarkCardRing(k.ring)} p-6 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col`}
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className={`w-10 h-10 rounded-lg ${k.bg} flex items-center justify-center`}>
                            <Banknote className={`w-5 h-5 ${k.text}`} />
                          </div>
                          <span className={`px-2.5 py-1 rounded text-[10px] font-extrabold tracking-wider uppercase ${k.chip}`}>
                            {loan.kind}
                          </span>
                        </div>

                        <p className="text-xs font-bold text-gray-500 dark:text-mdark-text-secondary mb-1">{loan.type}</p>
                        <p className="text-[10px] font-mono text-gray-400 dark:text-mdark-text-muted mb-4 break-all">{loan.control_number}</p>

                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-gray-500 dark:text-mdark-text-secondary font-medium">Principal</span>
                          <span className="font-bold text-gray-900 dark:text-mdark-text">{formatCurrency(loan.principal)}</span>
                        </div>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-gray-500 dark:text-mdark-text-secondary font-medium">Total Interest</span>
                          <span className="font-bold text-gray-900 dark:text-mdark-text">{formatCurrency(loan.totalInterest)}</span>
                        </div>
                        <div className="flex justify-between text-sm mb-4">
                          <span className="text-gray-500 dark:text-mdark-text-secondary font-medium">Monthly</span>
                          <span className="font-bold text-member-green dark:text-mdark-accent">{formatCurrency(loan.monthly)}</span>
                        </div>

                        <div className="mt-auto pt-4 border-t border-gray-100 dark:border-mdark-border flex items-center justify-between">
                          <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-mdark-text-muted">
                            Applied {formatDate(loan.applicationDate)}
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-member-green dark:text-mdark-accent">
                            View Summary <ChevronRight className="w-4 h-4" />
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-8">
                <div className=" gap-4">
                  <button
                    type="button"
                    onClick={() => setSelectedLoan(null)}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-mdark-border bg-white dark:bg-mdark-elevated px-3 py-2 text-xs font-bold text-gray-700 dark:text-mdark-text hover:bg-gray-50 dark:hover:bg-mdark-elevated"
                  >
                    <ArrowLeft className="w-4 h-4" /> Back to loans
                  </button>
                  <div>
                    <h1 className="font-extrabold text-[#1a4a2f] dark:text-mdark-accent text-xl sm:text-2xl mt-4">{selectedLoan.type}</h1>
                    <p className="text-[10px] font-mono text-gray-400">{selectedLoan.control_number}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={loadingRows || statementRows.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg bg-member-green hover:bg-[#154718] dark:bg-mdark-accent dark:hover:bg-mdark-accent/90 px-4 py-2.5 text-xs font-bold text-white disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  <Download className="w-4 h-4" /> Download as PDF
                </button>
              </div>

              <div className="mb-6 rounded-xl border border-green-200 dark:border-mdark-accent/30 bg-green-50 dark:bg-mdark-accent/10 p-4 grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-gray-500 dark:text-mdark-text-secondary uppercase tracking-wider">Member Name</p>
                  <p className="text-sm font-bold text-member-green dark:text-mdark-accent">{memberLabel}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-500 dark:text-mdark-text-secondary uppercase tracking-wider">Account Number</p>
                  <p className="text-sm font-bold text-member-green dark:text-mdark-accent">{accountNumber}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-500 dark:text-mdark-text-secondary uppercase tracking-wider">Loan Principal</p>
                  <p className="text-sm font-bold text-member-green dark:text-mdark-accent">{formatCurrency(selectedLoan.principal)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-500 dark:text-mdark-text-secondary uppercase tracking-wider">Generated On</p>
                  <p className="text-sm font-bold text-member-green dark:text-mdark-accent">
                    {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "2-digit" })}
                  </p>
                </div>
              </div>

              {position ? (
                <div className="bg-white dark:bg-mdark-card rounded-2xl shadow-sm border border-gray-100 dark:border-mdark-border overflow-hidden mb-8">
                  <div className="p-6 border-b border-gray-100 dark:border-mdark-border">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-mdark-text">Loan Position</h3>
                    {position.overdueCount > 0 ? (
                      <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-400">
                        <AlertTriangle className="w-4 h-4" />
                        {position.overdueCount} {position.overdueCount === 1 ? "installment" : "installments"} overdue
                        {" "}· oldest {position.maxDaysPastDue} days past due
                      </p>
                    ) : (
                      <p className="mt-1 text-xs font-medium text-gray-500 dark:text-mdark-text-secondary">No overdue installments.</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-gray-100 dark:bg-mdark-border">
                    {[
                      { label: "Remaining Balance", value: position.remaining, note: "Principal + interest still owed" },
                      { label: "Overdue Amount", value: position.overdueAmount, note: `${position.overdueCount} unpaid past due`, alert: position.overdueAmount > 0 },
                      { label: "Penalty Assessed", value: position.penalty, note: "Unpaid penalty posted", alert: position.penalty > 0 },
                      { label: "Amount Due Now", value: position.dueNow, note: "Overdue + penalty", alert: position.dueNow > 0 },
                    ].map((t) => (
                      <div key={t.label} className="bg-white dark:bg-mdark-card p-4">
                        <p className="text-[10px] font-bold text-gray-500 dark:text-mdark-text-secondary uppercase tracking-wider">{t.label}</p>
                        <p className={`text-base sm:text-lg font-black tabular-nums ${t.alert ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-mdark-text"}`}>
                          {formatCurrency(t.value)}
                        </p>
                        <p className="text-[11px] text-gray-400 dark:text-mdark-text-muted">{t.note}</p>
                      </div>
                    ))}
                  </div>

                  {position.next ? (
                    <p className="px-6 py-3 text-xs text-gray-600 dark:text-mdark-text-secondary border-t border-gray-100 dark:border-mdark-border">
                      Next installment: <span className="font-bold text-gray-900 dark:text-mdark-text">#{position.next.installment_no}</span>
                      {" "}due <span className="font-bold text-gray-900 dark:text-mdark-text">{formatDate(position.next.due_date)}</span>
                      {" "}· <span className="font-bold text-gray-900 dark:text-mdark-text">{formatCurrency(position.next.amount_due)}</span>
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="bg-white dark:bg-mdark-card rounded-2xl shadow-sm border border-gray-100 dark:border-mdark-border overflow-hidden mb-8 flex flex-col">
                <div className="p-6 flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 dark:border-mdark-border">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-mdark-text">Statement</h3>
                  <span className="bg-gray-100 dark:bg-mdark-elevated text-gray-500 dark:text-mdark-text-secondary px-3 py-1 rounded text-[9px] font-extrabold tracking-widest uppercase">
                    {statementCounts.paid} paid · {statementCounts.overdue} overdue · {statementCounts.upcoming} remaining
                  </span>
                </div>

                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full min-w-[1100px] text-left border-collapse">
                    <thead>
                      <tr className="bg-primary-deep dark:bg-mdark-nav text-[10px] uppercase tracking-wider text-white dark:text-mdark-text font-extrabold">
                        <th className="p-4 font-bold">#</th>
                        <th className="p-4 font-bold">Due Date</th>
                        <th className="p-4 font-bold">Paid On</th>
                        <th className="p-4 font-bold">Reference ID</th>
                        <th className="p-4 font-bold text-right">Principal</th>
                        <th className="p-4 font-bold text-right">Interest</th>
                        <th className="p-4 font-bold text-right">Penalty</th>
                        <th className="p-4 font-bold text-right">Amount</th>
                        <th className="p-4 font-bold">Status</th>
                        <th className="p-4 font-bold text-right">Balance After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingRows ? (
                        <TableStateRow colSpan={10} variant="loading" label="Loading statement…" />
                      ) : rowsError ? (
                        <tr>
                          <td colSpan="10" className="p-5 text-sm text-red-600 dark:text-red-400">{rowsError}</td>
                        </tr>
                      ) : statementRows.length === 0 ? (
                        <TableStateRow colSpan={10} variant="empty" icon={Receipt} label="No payments or installments found for this loan." />
                      ) : (
                        statementRows.map((r) => {
                          const paid = r.status === "Paid" || r.status === "Partial" || r.status === "Prepaid";
                          return (
                            <tr key={r.key} className={`border-b border-gray-100 dark:border-mdark-border transition-colors ${r.status === "Overdue" ? "bg-red-50/40 dark:bg-red-500/5" : "hover:bg-gray-50/50 dark:hover:bg-mdark-elevated/50"}`}>
                              <td className="p-4 text-sm font-medium text-gray-700 dark:text-mdark-text">{r.installment ?? "—"}</td>
                              <td className="p-4 text-sm text-gray-700 dark:text-mdark-text">{r.dueDate ? formatDate(r.dueDate) : "—"}</td>
                              <td className="p-4 text-sm text-gray-700 dark:text-mdark-text">{r.paidOn ? formatDate(r.paidOn) : "—"}</td>
                              <td className="p-4 text-xs font-mono text-gray-600 dark:text-mdark-text-secondary break-all">{r.reference || "—"}</td>
                              <td className="p-4 text-sm text-right tabular-nums text-gray-700 dark:text-mdark-text">{formatCurrency(r.principal)}</td>
                              <td className="p-4 text-sm text-right tabular-nums text-gray-700 dark:text-mdark-text">{formatCurrency(r.interest)}</td>
                              <td className={`p-4 text-sm text-right tabular-nums ${paid ? "text-red-400" : "text-gray-400 dark:text-mdark-text-muted"}`}>{paid ? formatCurrency(r.penalty) : "—"}</td>
                              <td className={`p-4 text-sm text-right tabular-nums font-black ${paid ? "text-member-green dark:text-mdark-accent" : "text-gray-900 dark:text-mdark-text"}`}>{formatCurrency(r.amount)}</td>
                              <td className="p-4"><StatusBadge row={r} /></td>
                              <td className="p-4 text-sm text-right tabular-nums font-bold text-gray-900 dark:text-mdark-text">{paid ? formatCurrency(r.balance) : "—"}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    {!loadingRows && !rowsError && statementRows.length > 0 ? (
                      <tfoot>
                        <tr className="bg-[#EAF1EB] text-member-green dark:bg-mdark-accent/15 dark:text-mdark-accent">
                          <td className="p-4 text-xs font-extrabold uppercase tracking-wider" colSpan="4">Total Paid</td>
                          <td className="p-4 text-sm font-black text-right">{formatCurrency(totals.principal)}</td>
                          <td className="p-4 text-sm font-black text-right">{formatCurrency(totals.interest)}</td>
                          <td className="p-4 text-sm font-black text-right">{formatCurrency(totals.penalty)}</td>
                          <td className="p-4 text-sm font-black text-right">{formatCurrency(totals.paid)}</td>
                          <td className="p-4" />
                          <td className="p-4 text-sm font-black text-right">{formatCurrency(latestBalance)}</td>
                        </tr>
                        {statementCounts.overdue + statementCounts.upcoming > 0 ? (
                          <tr className="bg-gray-50 text-gray-900 dark:bg-mdark-elevated dark:text-mdark-text">
                            <td className="p-4 text-xs font-extrabold uppercase tracking-wider" colSpan="4">Still Owed</td>
                            <td className="p-4 text-sm font-black text-right">{formatCurrency(owedTotals.principal)}</td>
                            <td className="p-4 text-sm font-black text-right">{formatCurrency(owedTotals.interest)}</td>
                            <td className="p-4 text-sm font-black text-right">{formatCurrency(position?.penalty || 0)}</td>
                            <td className="p-4 text-sm font-black text-right">{formatCurrency(owedTotals.amount)}</td>
                            <td className="p-4" colSpan="2" />
                          </tr>
                        ) : null}
                      </tfoot>
                    ) : null}
                  </table>
                </div>

                <div className="divide-y divide-gray-100 dark:divide-mdark-border md:hidden">
                  {loadingRows ? (
                    <TableStateRow bare variant="loading" label="Loading statement…" />
                  ) : rowsError ? (
                    <p className="p-6 text-sm text-red-600 dark:text-red-400 text-center">{rowsError}</p>
                  ) : statementRows.length === 0 ? (
                    <TableStateRow bare variant="empty" icon={Receipt} label="No payments or installments found for this loan." />
                  ) : (
                    statementRows.map((r) => {
                      const paid = r.status === "Paid" || r.status === "Partial" || r.status === "Prepaid";
                      return (
                        <div key={r.key} className={`px-4 py-3.5 ${r.status === "Overdue" ? "bg-red-50/40 dark:bg-red-500/5" : ""}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-gray-700 dark:text-mdark-text">
                                {r.installment ? `#${r.installment} · ` : ""}{r.dueDate ? `Due ${formatDate(r.dueDate)}` : formatDate(r.paidOn)}
                              </p>
                              <p className="truncate text-[10px] font-mono text-gray-500 dark:text-mdark-text-secondary">
                                {paid ? `Paid ${formatDate(r.paidOn)} · ${r.reference || "—"}` : "Not yet paid"}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className={`text-sm font-black ${paid ? "text-member-green dark:text-mdark-accent" : "text-gray-900 dark:text-mdark-text"}`}>{formatCurrency(r.amount)}</p>
                              <StatusBadge row={r} />
                            </div>
                          </div>
                          <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                            <span className="text-gray-500 dark:text-mdark-text-secondary">Principal: <span className="font-bold text-gray-700 dark:text-mdark-text">{formatCurrency(r.principal)}</span></span>
                            <span className="text-gray-500 dark:text-mdark-text-secondary">Interest: <span className="font-bold text-gray-700 dark:text-mdark-text">{formatCurrency(r.interest)}</span></span>
                            {paid ? (
                              <>
                                <span className="text-gray-500 dark:text-mdark-text-secondary">Penalty: <span className="font-medium text-red-400">{formatCurrency(r.penalty)}</span></span>
                                <span className="text-gray-500 dark:text-mdark-text-secondary">Balance: <span className="font-bold text-gray-900 dark:text-mdark-text">{formatCurrency(r.balance)}</span></span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  )}
                  {!loadingRows && !rowsError && statementRows.length > 0 ? (
                    <div className="px-4 py-3.5 bg-[#EAF1EB] dark:bg-mdark-accent/15 text-member-green dark:text-mdark-accent">
                      <p className="text-[10px] font-extrabold uppercase tracking-wider mb-2">Totals</p>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs font-black">
                        <span>Total Paid: {formatCurrency(totals.paid)}</span>
                        <span>Penalty Paid: {formatCurrency(totals.penalty)}</span>
                        <span>Still Owed: {formatCurrency(owedTotals.amount)}</span>
                        <span>Balance: {formatCurrency(latestBalance)}</span>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          ))}

          {activeTab === "savings" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 lg:gap-6 mb-8">
                <div className="bg-white dark:bg-mdark-card p-3.5 sm:p-5 lg:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-mdark-border flex flex-col">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-[#EAF1EB] dark:bg-mdark-accent/15 flex items-center justify-center mb-2.5 sm:mb-6">
                    <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-member-green dark:text-mdark-accent" />
                  </div>
                  <p className="text-[10px] font-bold text-gray-500 dark:text-mdark-text-secondary uppercase tracking-widest mb-1">Current Balance</p>
                  <h3 className="text-base sm:text-2xl lg:text-3xl font-black text-gray-900 dark:text-mdark-text break-words">{formatCurrency(regularSavings)}</h3>
                </div>
                <div className="bg-white dark:bg-mdark-card p-3.5 sm:p-5 lg:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-mdark-border flex flex-col">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-blue-50 dark:bg-blue-500/15 flex items-center justify-center mb-2.5 sm:mb-6">
                    <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-300" />
                  </div>
                  <p className="text-[10px] font-bold text-gray-500 dark:text-mdark-text-secondary uppercase tracking-widest mb-1">Total Interest Earned (YTD)</p>
                  <h3 className="text-base sm:text-2xl lg:text-3xl font-black text-gray-900 dark:text-mdark-text break-words">{formatCurrency(ytdInterestEarned)}</h3>
                </div>
                <div className="bg-white dark:bg-mdark-card p-3.5 sm:p-5 lg:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-mdark-border flex flex-col">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-member-green dark:bg-mdark-accent flex items-center justify-center mb-2.5 sm:mb-6">
                    <CalendarClock className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                  <p className="text-[10px] font-bold text-gray-500 dark:text-mdark-text-secondary uppercase tracking-widest mb-1">Next Interest Posting</p>
                  <h3 className="text-base sm:text-2xl lg:text-3xl font-black text-gray-900 dark:text-mdark-text break-words">
                    {interestPreview?.period_quarter ? formatDate(interestPreview.period_quarter) : "—"}
                  </h3>
                  <span className="mt-1 inline-flex self-start px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EAF1EB] text-member-green dark:bg-mdark-accent/15 dark:text-mdark-accent">
                    {(interestRate * 100).toFixed(2)}% Annual Rate
                  </span>
                </div>
              </div>

              <div className="bg-white dark:bg-mdark-card rounded-2xl shadow-sm border border-gray-100 dark:border-mdark-border overflow-hidden mb-8 flex flex-col">
                <div className="p-6 flex items-center justify-between border-b border-gray-100 dark:border-mdark-border">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-mdark-text">Savings Statement</h3>
                  <button
                    type="button"
                    onClick={handleDownloadSavingsPdf}
                    disabled={loadingSavings || savingsRows.length === 0}
                    className="inline-flex items-center gap-2 rounded-lg bg-member-green hover:bg-[#154718] dark:bg-mdark-accent dark:hover:bg-mdark-accent/90 px-4 py-2.5 text-xs font-bold text-white disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    <Download className="w-4 h-4" /> Download as PDF
                  </button>
                </div>

                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left border-collapse">
                    <thead>
                      <tr className="bg-primary-deep dark:bg-mdark-nav text-[10px] uppercase tracking-wider text-white dark:text-mdark-text font-extrabold">
                        <th className="p-5 font-bold">Date</th>
                        <th className="p-5 font-bold">Transaction Type</th>
                        <th className="p-5 font-bold text-right">Withdrawals</th>
                        <th className="p-5 font-bold text-right">Interest Earned</th>
                        <th className="p-5 font-bold text-right">Deposits</th>
                        <th className="p-5 font-bold text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingSavings ? (
                        <TableStateRow colSpan={6} variant="loading" label="Loading savings statement…" />
                      ) : savingsError ? (
                        <tr>
                          <td colSpan="6" className="p-5 text-sm text-red-600 dark:text-red-400">{savingsError}</td>
                        </tr>
                      ) : savingsRows.length === 0 ? (
                        <TableStateRow colSpan={6} variant="empty" icon={Wallet} label="No savings transactions found." />
                      ) : (
                        savingsRows.map((r, idx) => {
                          const isCredit = String(r?.entry_type || "").toLowerCase() === "credit";
                          const amount = Number(r?.amount || 0);
                          const isInterestPost = String(r?.source || "") === "savings_interest";
                          const interestRow = interestByLedgerId.get(r.id);
                          const prevRow = savingsRows[idx - 1]; // query sorts oldest-first
                          const prevInterestRow = prevRow ? interestByLedgerId.get(prevRow.id) : null;
                          const days = interestRow && prevInterestRow
                            ? Math.round((new Date(interestRow.date) - new Date(prevInterestRow.date)) / 86400000)
                            : null;
                          return (
                            <tr key={r.id} className="border-b border-gray-100 dark:border-mdark-border hover:bg-gray-50/50 dark:hover:bg-mdark-elevated/50 transition-colors">
                              <td className="p-5 text-sm font-medium text-gray-700 dark:text-mdark-text">{formatDate(r.posted_at)}</td>
                              <td className="p-5">
                                <div className="flex items-center gap-2">
                                  <PassbookBadge code={isInterestPost ? "Int." : isCredit ? "CD" : "WD"} />
                                  {interestRow ? (
                                    <InterestFormulaTooltip
                                      days={days ?? 0}
                                      balance={interestRow.running_balance}
                                      rate={interestRate}
                                      amount={interestRow.accrued_line_interest}
                                    >
                                      <span className="text-xs font-bold text-gray-700 dark:text-mdark-text">
                                        {r.remarks || (isCredit ? "Savings Deposit" : "Savings Withdrawal")}
                                      </span>
                                    </InterestFormulaTooltip>
                                  ) : (
                                    <span className="text-xs font-bold text-gray-700 dark:text-mdark-text">
                                      {r.remarks || (isCredit ? "Savings Deposit" : "Savings Withdrawal")}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-5 text-sm font-bold text-right text-red-500 dark:text-red-400">
                                {!isCredit ? `-${formatCurrency(amount)}` : "—"}
                              </td>
                              <td className="p-5 text-sm font-bold text-right text-blue-700 dark:text-blue-300">
                                {isInterestPost ? `+${formatCurrency(amount)}` : "—"}
                              </td>
                              <td className="p-5 text-sm font-bold text-right text-green-600 dark:text-mdark-accent">
                                {isCredit && !isInterestPost ? `+${formatCurrency(amount)}` : "—"}
                              </td>
                              <td className="p-5 text-sm font-black text-gray-900 dark:text-mdark-text text-right">{formatCurrency(r.running_balance)}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    {!loadingSavings && !savingsError && savingsRows.length > 0 ? (
                      <tfoot>
                        <tr className="bg-[#EAF1EB] text-member-green dark:bg-mdark-accent/15 dark:text-mdark-accent">
                          <td className="p-5 text-xs font-extrabold uppercase tracking-wider" colSpan="2">Totals</td>
                          <td className="p-5 text-sm font-black text-right">-{formatCurrency(savingsTotals.debits)}</td>
                          <td className="p-5 text-sm font-black text-right">+{formatCurrency(ytdInterestEarned)}</td>
                          <td className="p-5 text-sm font-black text-right">+{formatCurrency(savingsTotals.credits)}</td>
                          <td className="p-5 text-sm font-black text-right">{formatCurrency(regularSavings)}</td>
                        </tr>
                      </tfoot>
                    ) : null}
                  </table>
                </div>

                <div className="divide-y divide-gray-100 dark:divide-mdark-border md:hidden">
                  {loadingSavings ? (
                    <TableStateRow bare variant="loading" label="Loading savings statement…" />
                  ) : savingsError ? (
                    <p className="p-6 text-sm text-red-600 dark:text-red-400 text-center">{savingsError}</p>
                  ) : savingsRows.length === 0 ? (
                    <TableStateRow bare variant="empty" icon={Wallet} label="No savings transactions found." />
                  ) : (
                    savingsRows.map((r) => {
                      const isCredit = String(r?.entry_type || "").toLowerCase() === "credit";
                      const amount = Number(r?.amount || 0);
                      return (
                        <div key={r.id} className="px-4 py-3.5 hover:bg-gray-50/50 dark:hover:bg-mdark-elevated/50 transition-colors">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-gray-700 dark:text-mdark-text">{r.remarks || (isCredit ? "Savings Deposit" : "Savings Withdrawal")}</p>
                              <p className="text-xs text-gray-500 dark:text-mdark-text-secondary">{formatDate(r.posted_at)}</p>
                            </div>
                            <span className={`shrink-0 text-sm font-bold ${isCredit ? "text-green-600 dark:text-mdark-accent" : "text-red-500 dark:text-red-400"}`}>
                              {isCredit ? "+" : "-"}{formatCurrency(amount)}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500 dark:text-mdark-text-secondary">
                            <span className="truncate font-mono">{r.reference || "—"}</span>
                            <span>Balance: <span className="font-black text-gray-900 dark:text-mdark-text">{formatCurrency(r.running_balance)}</span></span>
                          </div>
                        </div>
                      );
                    })
                  )}
                  {!loadingSavings && !savingsError && savingsRows.length > 0 ? (
                    <div className="px-4 py-3.5 bg-[#EAF1EB] dark:bg-mdark-accent/15 text-member-green dark:text-mdark-accent flex items-center justify-between text-xs font-black">
                      <span>Totals: +{formatCurrency(savingsTotals.credits)} / -{formatCurrency(savingsTotals.debits)}</span>
                      <span>{formatCurrency(regularSavings)}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          )}

          {activeTab === "time-deposits" && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:gap-6 mb-8">
                <div className="bg-white dark:bg-mdark-card p-3.5 sm:p-5 lg:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-mdark-border flex flex-col">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-[#EAF1EB] dark:bg-mdark-accent/15 flex items-center justify-center mb-2.5 sm:mb-6">
                    <PiggyBank className="w-4 h-4 sm:w-5 sm:h-5 text-member-green dark:text-mdark-accent" />
                  </div>
                  <p className="text-[10px] font-bold text-gray-500 dark:text-mdark-text-secondary uppercase tracking-widest mb-1">Active Principal</p>
                  <h3 className="text-base sm:text-2xl lg:text-3xl font-black text-gray-900 dark:text-mdark-text break-words">
                    {formatCurrency(
                      tdPlacements
                        .filter((p) => p.status !== "closed")
                        .reduce((sum, p) => sum + Number(p.principal || 0), 0)
                    )}
                  </h3>
                </div>
                <div className="bg-white dark:bg-mdark-card p-3.5 sm:p-5 lg:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-mdark-border flex flex-col">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-member-green dark:bg-mdark-accent flex items-center justify-center mb-2.5 sm:mb-6">
                    <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                  <p className="text-[10px] font-bold text-gray-500 dark:text-mdark-text-secondary uppercase tracking-widest mb-1">Certificates</p>
                  <h3 className="text-base sm:text-2xl lg:text-3xl font-black text-gray-900 dark:text-mdark-text">{tdPlacements.length}</h3>
                </div>
              </div>

              <div className="bg-white dark:bg-mdark-card rounded-2xl shadow-sm border border-gray-100 dark:border-mdark-border overflow-hidden mb-8">
                <div className="p-6 border-b border-gray-100 dark:border-mdark-border">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-mdark-text">Time Deposit Certificates</h3>
                  <p className="text-xs text-gray-500 dark:text-mdark-text-secondary mt-1">
                    Expected interest earned is an estimate until the certificate matures and is settled.
                  </p>
                </div>

                {loadingTd ? (
                  <div className="p-6">
                    <TableStateRow bare variant="loading" label="Loading Time Deposits…" />
                  </div>
                ) : tdError ? (
                  <p className="p-6 text-sm text-red-600 dark:text-red-400">{tdError}</p>
                ) : tdPlacements.length === 0 ? (
                  <div className="p-6">
                    <TableStateRow bare variant="empty" icon={PiggyBank} label="No Time Deposit certificates yet." />
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-mdark-border">
                    {tdPlacements.map((p) => {
                      const { totalDays, elapsedDays, percent } = tdProgress(p);
                      const isMatured = p.status === "matured";
                      const isClosed = p.status === "closed";
                      const statusLabel = isClosed ? "Settled" : isMatured ? "Matured — awaiting settlement" : "Term in progress";
                      const statusTone = isClosed
                        ? "bg-gray-100 text-gray-700 dark:bg-mdark-elevated dark:text-mdark-text-secondary"
                        : isMatured
                          ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                          : "bg-[#EAF1EB] text-member-green dark:bg-mdark-accent/15 dark:text-mdark-accent";
                      return (
                        <div key={p.id} className="p-6">
                          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                            <div>
                              <p className="text-sm font-mono font-bold text-gray-800 dark:text-mdark-text">{p.certificate_number}</p>
                              <p className="text-xs text-gray-500 dark:text-mdark-text-secondary mt-0.5">
                                {p.term_days} days · {(Number(p.annual_rate || 0) * 100).toFixed(2)}% annual rate
                              </p>
                            </div>
                            <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${statusTone}`}>
                              {statusLabel}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-sm">
                            <div>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Principal</p>
                              <p className="font-bold text-gray-900 dark:text-mdark-text">{formatCurrency(p.principal)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Interest Earned</p>
                              <p className="font-bold text-emerald-700 dark:text-mdark-accent">{formatCurrency(p.expected_interest)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Placed</p>
                              <p className="font-semibold text-gray-700 dark:text-mdark-text">{formatDate(p.placement_date)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Maturity Date</p>
                              <p className="font-semibold text-gray-700 dark:text-mdark-text">{formatDate(p.maturity_date)}</p>
                            </div>
                          </div>

                          {!isClosed && (
                            <div>
                              <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-mdark-text-secondary mb-1">
                                <span>{elapsedDays} of {totalDays} days · {percent}% complete</span>
                              </div>
                              <div className="h-2 rounded-full bg-gray-100 dark:bg-mdark-elevated overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${isMatured ? "bg-amber-400" : "bg-member-green dark:bg-mdark-accent"}`}
                                  style={{ width: `${isMatured ? 100 : percent}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === "transactions" && (
            <MemberTransactionsTab
              initialReceiptNo={initialReceiptNo}
              initialOpenId={initialOpenId}
            />
          )}

          {activeTab === "cbu" && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:gap-6 mb-8">
                <div className="bg-white dark:bg-mdark-card p-3.5 sm:p-5 lg:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-mdark-border flex flex-col">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-[#EAF1EB] dark:bg-mdark-accent/15 flex items-center justify-center mb-2.5 sm:mb-6">
                    <PiggyBank className="w-4 h-4 sm:w-5 sm:h-5 text-member-green dark:text-mdark-accent" />
                  </div>
                  <p className="text-[10px] font-bold text-gray-500 dark:text-mdark-text-secondary uppercase tracking-widest mb-1">Ending Share Capital</p>
                  <h3 className="text-base sm:text-2xl lg:text-3xl font-black text-gray-900 dark:text-mdark-text break-words">
                    {formatCurrency(cbuRows[cbuRows.length - 1]?.ending_share_capital || 0)}
                  </h3>
                </div>
                <div className="bg-white dark:bg-mdark-card p-3.5 sm:p-5 lg:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-mdark-border flex flex-col">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-member-green dark:bg-mdark-accent flex items-center justify-center mb-2.5 sm:mb-6">
                    <Banknote className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                  <p className="text-[10px] font-bold text-gray-500 dark:text-mdark-text-secondary uppercase tracking-widest mb-1">Total Capital Added</p>
                  <h3 className="text-base sm:text-2xl lg:text-3xl font-black text-gray-900 dark:text-mdark-text break-words">{formatCurrency(cbuTotals.added)}</h3>
                </div>
              </div>

              <div className="bg-white dark:bg-mdark-card rounded-2xl shadow-sm border border-gray-100 dark:border-mdark-border overflow-hidden mb-8 flex flex-col">
                <div className="p-6 flex items-center justify-between border-b border-gray-100 dark:border-mdark-border">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-mdark-text">Capital Build-Up Statement</h3>
                  <button
                    type="button"
                    onClick={handleDownloadCbuPdf}
                    disabled={loadingCbu || cbuRows.length === 0}
                    className="inline-flex items-center gap-2 rounded-lg bg-member-green hover:bg-[#154718] dark:bg-mdark-accent dark:hover:bg-mdark-accent/90 px-4 py-2.5 text-xs font-bold text-white disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    <Download className="w-4 h-4" /> Download as PDF
                  </button>
                </div>

                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left border-collapse">
                    <thead>
                      <tr className="bg-primary-deep dark:bg-mdark-nav text-[10px] uppercase tracking-wider text-white dark:text-mdark-text font-extrabold">
                        <th className="p-5 font-bold">Date</th>
                        <th className="p-5 font-bold">Source</th>
                        <th className="p-5 font-bold text-right">Starting Share Capital</th>
                        <th className="p-5 font-bold text-right">Capital Added</th>
                        <th className="p-5 font-bold text-right">Ending Share Capital</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingCbu ? (
                        <TableStateRow colSpan={5} variant="loading" label="Loading capital build-up statement…" />
                      ) : cbuError ? (
                        <tr>
                          <td colSpan="5" className="p-5 text-sm text-red-600 dark:text-red-400">{cbuError}</td>
                        </tr>
                      ) : cbuRows.length === 0 ? (
                        <TableStateRow colSpan={5} variant="empty" icon={PiggyBank} label="No capital build-up transactions found." />
                      ) : (
                        cbuRows.map((r) => (
                          <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                            <td className="p-5 text-sm font-medium text-gray-700 dark:text-mdark-text">{formatDate(r.transaction_date)}</td>
                            <td className="p-5 text-sm font-bold text-gray-700 dark:text-mdark-text">{humanizeSource(r.deposit_account)}</td>
                            <td className="p-5 text-sm font-medium text-gray-600 dark:text-mdark-text-secondary text-right">{formatCurrency(r.starting_share_capital)}</td>
                            <td className={`p-5 text-sm font-bold text-right ${Number(r.capital_added || 0) < 0 ? "text-red-500 dark:text-red-400" : "text-green-600 dark:text-mdark-accent"}`}>{formatSignedCurrency(r.capital_added)}</td>
                            <td className="p-5 text-sm font-black text-gray-900 dark:text-mdark-text text-right">{formatCurrency(r.ending_share_capital)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {!loadingCbu && !cbuError && cbuRows.length > 0 ? (
                      <tfoot>
                        <tr className="bg-[#EAF1EB] text-member-green dark:bg-mdark-accent/15 dark:text-mdark-accent">
                          <td className="p-5 text-xs font-extrabold uppercase tracking-wider" colSpan="3">Totals</td>
                          <td className="p-5 text-sm font-black text-right">{formatSignedCurrency(cbuTotals.added)}</td>
                          <td className="p-5 text-sm font-black text-right">
                            {formatCurrency(cbuRows[cbuRows.length - 1]?.ending_share_capital || 0)}
                          </td>
                        </tr>
                      </tfoot>
                    ) : null}
                  </table>
                </div>

                <div className="divide-y divide-gray-100 dark:divide-mdark-border md:hidden">
                  {loadingCbu ? (
                    <TableStateRow bare variant="loading" label="Loading capital build-up statement…" />
                  ) : cbuError ? (
                    <p className="p-6 text-sm text-red-600 dark:text-red-400 text-center">{cbuError}</p>
                  ) : cbuRows.length === 0 ? (
                    <TableStateRow bare variant="empty" icon={PiggyBank} label="No capital build-up transactions found." />
                  ) : (
                    cbuRows.map((r) => (
                      <div key={r.id} className="px-4 py-3.5 hover:bg-gray-50/50 dark:hover:bg-mdark-elevated/50 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-gray-700 dark:text-mdark-text">{humanizeSource(r.deposit_account)}</p>
                            <p className="text-xs text-gray-500 dark:text-mdark-text-secondary">{formatDate(r.transaction_date)}</p>
                          </div>
                          <span className={`shrink-0 text-sm font-bold ${Number(r.capital_added || 0) < 0 ? "text-red-500 dark:text-red-400" : "text-green-600 dark:text-mdark-accent"}`}>{formatSignedCurrency(r.capital_added)}</span>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500 dark:text-mdark-text-secondary">
                          <span>Starting: {formatCurrency(r.starting_share_capital)}</span>
                          <span>Ending: <span className="font-black text-gray-900 dark:text-mdark-text">{formatCurrency(r.ending_share_capital)}</span></span>
                        </div>
                      </div>
                    ))
                  )}
                  {!loadingCbu && !cbuError && cbuRows.length > 0 ? (
                    <div className="px-4 py-3.5 bg-[#EAF1EB] dark:bg-mdark-accent/15 text-member-green dark:text-mdark-accent flex items-center justify-between text-xs font-black">
                      <span>Totals: {formatSignedCurrency(cbuTotals.added)}</span>
                      <span>{formatCurrency(cbuRows[cbuRows.length - 1]?.ending_share_capital || 0)}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </main>

      </div>
    </div>
  );
};

export default Member_StatementOfAccount;
