import React, { useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import logo from "../../assets/img/ttmpc logo.png";
import { LayoutDashboard, CreditCard, UserSearch, Search, Bell, Banknote } from "lucide-react";

const STATIC_MEMBERSHIP_NO_ACCOUNT = [
  { member_id: "TTMPC_M_00002", full_name: "Erden Jhed Teope", email: "erden@example.com" },
  { member_id: "TTMPC_M_00004", full_name: "Romelyn Delos Reyes", email: "romelyn@example.com" },
  { member_id: "TTMPC_M_00005", full_name: "Nash Ervine Siaton", email: "nash@example.com" },
  { member_id: "TTMPC_M_00006", full_name: "Kirito Sugba", email: "kirito@example.com" },
];

// Static lookup for now. Later this can call Supabase by member name.
const getMemberByName = (memberName) => {
  const normalized = String(memberName || "").trim().toLowerCase();
  return STATIC_MEMBERSHIP_NO_ACCOUNT.find((m) => m.full_name.toLowerCase() === normalized) || null;
};

const Add_Savings = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();

  const [memberNameInput, setMemberNameInput] = useState("");
  const [selectedMember, setSelectedMember] = useState(null);
  const [lookupError, setLookupError] = useState("");

  const [accountType, setAccountType] = useState("regular_savings");
  const [initialDeposit, setInitialDeposit] = useState("");
  const [openDate, setOpenDate] = useState(new Date().toISOString().split("T")[0]);
  const [maturityTerm, setMaturityTerm] = useState("");

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Disbursement", icon: Banknote },
    { name: "Savings", icon: CreditCard },
  ];

  const routeMap = {
    Dashboard: "/Cashier_Dashboard",
    Disbursement: "/Cashier_Disbursement",
    Savings: "/Cashier_Savings",
  };

  const accountTypeLabel = useMemo(() => {
    if (accountType === "time_deposit") return "Time Deposit Savings";
    return "Regular Savings";
  }, [accountType]);

  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  const handleLookup = () => {
    setLookupError("");
    setSelectedMember(null);

    const member = getMemberByName(memberNameInput);
    if (!member) {
      setLookupError("Member name not found.");
      return;
    }

    setSelectedMember(member);
  };

  const handleOpenAccount = (e) => {
    e.preventDefault();

    if (!selectedMember) {
      setLookupError("Lookup a valid member first.");
      return;
    }

    if (accountType === "time_deposit" && !maturityTerm) {
      setLookupError("Maturity term is required for Time Deposit Savings.");
      return;
    }

    const computeMaturityDate = (startDate, termKey) => {
      const d = new Date(startDate);
      if (Number.isNaN(d.getTime())) return null;

      const termMap = {
        "6_months": { months: 6 },
        "7_months": { months: 7 },
        "8_months": { months: 8 },
        "9_months": { months: 9 },
        "10_months": { months: 10 },
        "11_months": { months: 11 },
        "1_year": { years: 1 },
        "2_years": { years: 2 },
      };

      const selected = termMap[termKey];
      if (!selected) return null;

      if (selected.months) d.setMonth(d.getMonth() + selected.months);
      if (selected.years) d.setFullYear(d.getFullYear() + selected.years);

      return d.toISOString().split("T")[0];
    };

    const payload = {
      member_id: selectedMember.member_id,
      account_type: accountType,
      initial_deposit: Number(initialDeposit || 0),
      open_date: openDate,
      maturity_term: accountType === "time_deposit" ? maturityTerm : null,
      maturity_date: accountType === "time_deposit" ? computeMaturityDate(openDate, maturityTerm) : null,
    };

    console.log("Open savings account payload:", payload);
    alert("Savings account created (static demo).");

    setInitialDeposit("");
    setMaturityTerm("");
    setAccountType("regular_savings");
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src={logo} alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Cashier Portal</p>
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const to = routeMap[item.name] || `/${item.name.toLowerCase().replace(/\s+/g, "-")}`;
            return (
              <NavLink
                key={item.name}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 p-2 rounded-md transition-colors ${
                    isActive
                      ? "bg-green-50 text-green-700 font-semibold"
                      : "text-gray-700 hover:bg-green-50 hover:text-green-700"
                  }`
                }
              >
                <Icon size={20} />
                <span>{item.name}</span>
              </NavLink>
            );
          })}
        </nav>

        <button
          onClick={handleSignOut}
          className="mt-auto w-full rounded p-2 text-xs bg-green-600 hover:bg-green-700 text-white font-bold transition-colors"
        >
          Sign out
        </button>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-300 px-4 py-1 focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <p className="ml-4">Cashier</p>
        </header>

        <main className="p-8">
          <div className="max-w-3xl bg-white border border-gray-200 rounded-xl shadow-sm p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Open Savings Account</h1>

            <div className="border border-gray-200 rounded-lg p-4 mb-6 bg-gray-50">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Lookup Member Name</label>
              <div className="flex gap-3">
                <input
                  value={memberNameInput}
                  onChange={(e) => setMemberNameInput(e.target.value)}
                  placeholder="e.g. Erden Jhed Teope"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <button
                  onClick={handleLookup}
                  type="button"
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold flex items-center gap-2"
                >
                  <UserSearch size={16} />
                  Get Member
                </button>
              </div>
              {lookupError ? <p className="text-sm text-red-600 mt-3">{lookupError}</p> : null}
            </div>

            {selectedMember ? (
              <form onSubmit={handleOpenAccount} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs uppercase text-gray-500 font-semibold mb-1">Member ID</p>
                    <p className="font-bold text-gray-800">{selectedMember.member_id}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-gray-500 font-semibold mb-1">Member Name</p>
                    <p className="font-bold text-gray-800">{selectedMember.full_name}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Savings Type</label>
                  <select
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="regular_savings">Regular Savings</option>
                    <option value="time_deposit">Time Deposit Savings</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Initial Deposit</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={initialDeposit}
                      onChange={(e) => setInitialDeposit(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Opening Date</label>
                    <input
                      type="date"
                      required
                      value={openDate}
                      onChange={(e) => setOpenDate(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>

                {accountType === "time_deposit" ? (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Maturity Term</label>
                    <select
                      required
                      value={maturityTerm}
                      onChange={(e) => setMaturityTerm(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="">Select maturity term</option>
                      <option value="6_months">6 months</option>
                      <option value="7_months">7 months</option>
                      <option value="8_months">8 months</option>
                      <option value="9_months">9 months</option>
                      <option value="10_months">10 months</option>
                      <option value="11_months">11 months</option>
                      <option value="1_year">1 year</option>
                      <option value="2_years">2 years</option>
                    </select>
                  </div>
                ) : null}

                <div className="pt-2">
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold"
                  >
                    Open {accountTypeLabel}
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Add_Savings;
