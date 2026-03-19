import React from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  CreditCard, 
  Calculator, 
  Activity, 
  BarChart3, 
  History,
  Search,
  Bell
} from 'lucide-react';


const Payments = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();

  // Mock loan data
  const [loans, setLoans] = React.useState([
    {
      id: 1,
      memberName: "Juan Dela Cruz",
      loanAmount: 50000,
      interestRate: 6,
      term: 12,
      amortization: 4500,
      dueDate: "2026-03-01",
      remainingBalance: 20000,
      status: "Partially Paid",
    },
    {
      id: 2,
      memberName: "Maria Santos",
      loanAmount: 30000,
      interestRate: 5,
      term: 6,
      amortization: 5200,
      dueDate: "2026-02-15",
      remainingBalance: 30000,
      status: "Unpaid",
    },
    {
      id: 3,
      memberName: "Pedro Reyes",
      loanAmount: 10000,
      interestRate: 7,
      term: 3,
      amortization: 3500,
      dueDate: "2026-01-10",
      remainingBalance: 0,
      status: "Fully Paid",
    },
  ]);

  // Modal state
  const [selectedLoan, setSelectedLoan] = React.useState(null);
  const [paymentAmount, setPaymentAmount] = React.useState(0);
  const [showModal, setShowModal] = React.useState(false);
  const [successMsg, setSuccessMsg] = React.useState("");

  // Utility: Penalty calculation
  function computePenalty(loan) {
    const today = new Date();
    const due = new Date(loan.dueDate);
    if (loan.remainingBalance > 0 && today > due) {
      // Example: 2% penalty per month overdue
      const monthsOverdue = Math.max(
        0,
        (today.getFullYear() - due.getFullYear()) * 12 + today.getMonth() - due.getMonth()
      );
      return Math.round(loan.remainingBalance * 0.02 * monthsOverdue);
    }
    return 0;
  }

  // Backend-ready functions
  async function fetchLoans() {
    // Placeholder for backend fetch
    // e.g., fetch from Supabase or REST API
    // setLoans(await api.getLoans());
  }

  async function processPayment(loanId, amount) {
    // Placeholder for backend payment processing
    // e.g., call Supabase or REST API
    // await api.processPayment(loanId, amount);
  }

  // Handle Pay button
  function openPaymentModal(loan) {
    setSelectedLoan(loan);
    setPaymentAmount(0);
    setShowModal(true);
    setSuccessMsg("");
  }

  // Handle payment submission
  function handlePaymentSubmit(e) {
    e.preventDefault();
    if (!selectedLoan) return;
    const penalty = computePenalty(selectedLoan);
    let payAmt = Number(paymentAmount);
    if (payAmt <= 0) return;
    // Validation: No overpayment unless allowed
    if (payAmt > selectedLoan.remainingBalance + penalty) {
      setSuccessMsg("Payment exceeds balance + penalty.");
      return;
    }
    // Update loan state
    setLoans((prevLoans) =>
      prevLoans.map((loan) => {
        if (loan.id === selectedLoan.id) {
          const newBalance = Math.max(loan.remainingBalance + penalty - payAmt, 0);
          let newStatus = loan.status;
          if (newBalance === 0) newStatus = "Fully Paid";
          else if (newBalance < loan.loanAmount) newStatus = "Partially Paid";
          else newStatus = "Unpaid";
          return {
            ...loan,
            remainingBalance: newBalance,
            status: newStatus,
          };
        }
        return loan;
      })
    );
    setShowModal(false);
    setSuccessMsg("Payment successful!");
    // Backend call
    processPayment(selectedLoan.id, payAmt);
  }

  // Modal close
  function closeModal() {
    setShowModal(false);
    setSelectedLoan(null);
    setPaymentAmount(0);
  }
  
const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Member Records", icon: Users },
    { name: "Loan Approval", icon: FileText },
    { name: "Manage Loans", icon: CreditCard },
    { name: "Payments", icon: CreditCard },
    { name: "Accounting", icon: Calculator },
    { name: "MIGS Scoring", icon: Activity },
    { name: "Reports", icon: BarChart3 },
    { name: "Audit Trail", icon: History },
  ];
 

  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
              Bookkeeper Portal
            </p>
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        
        <nav className="flex flex-col gap-2 text-sm flex-grow">
  {(() => {
    const routeMap = {
      Dashboard: "/dashboard",
      "Member Records": "/records",
      "Loan Approval": "/bookkeeper-loan-approval",
    "Manage Loans":"/manage-loans",
      Payments: "/payments",
      Accounting: "/accounting",
      MIGS: "/migs",
      Reports: "/reports",
      "Audit Trail": "/audit-trail",
    };

    return menuItems.map((item) => {
      const Icon = item.icon;
      const to = routeMap[item.name] || `/${item.name.toLowerCase().replace(/\s+/g, '-')}`;

      return (
        <NavLink
          key={item.name}
          to={to}
          className={({ isActive }) =>
            `flex items-center gap-3 p-2 rounded-md transition-colors ${
              isActive
                ? 'bg-green-50 text-green-700 font-semibold'
                : 'text-gray-700 hover:bg-green-50 hover:text-green-700'
            }`
          }
        >
          <Icon size={20} />
          <span>{item.name}</span>
        </NavLink>
      );
    });
  })()}
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
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"/>
          <input type="text" className=" bg-gray-50  w-52 h-10 rounded-lg border border-gray-300 px-4 
          py-1 focus:outline-none focus:ring-2 focus:ring-green-500"></input>
          </div>
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
          <Bell className="w-5 h-5"/>
          <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <img src="src/assets/img/bookkeeper-profile.png" alt="Bookkeeper Profile" className="ml-4 w-8 h-8 rounded-full"></img>
          <p>Bookkeeper</p>
        </header>

        {/* Page Content */}
        <main className="p-8">
          <h1 className="font-bold text-2xl mb-6">Loan Payments</h1>
          {/* Success feedback */}
          {successMsg && (
            <div className="mb-4 p-3 bg-green-100 text-green-700 rounded">{successMsg}</div>
          )}

          {/* Loan List Table */}
          <div className="overflow-x-auto bg-white rounded shadow p-4">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left">Member Name</th>
                  <th className="px-3 py-2 text-left">Loan Amount</th>
                  <th className="px-3 py-2 text-left">Interest Rate</th>
                  <th className="px-3 py-2 text-left">Term</th>
                  <th className="px-3 py-2 text-left">Amortization</th>
                  <th className="px-3 py-2 text-left">Due Date</th>
                  <th className="px-3 py-2 text-left">Remaining Balance</th>
                  <th className="px-3 py-2 text-left">Loan Status</th>
                  <th className="px-3 py-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((loan) => (
                  <tr key={loan.id} className="border-b last:border-none">
                    <td className="px-3 py-2">{loan.memberName}</td>
                    <td className="px-3 py-2">₱{loan.loanAmount.toLocaleString()}</td>
                    <td className="px-3 py-2">{loan.interestRate}%</td>
                    <td className="px-3 py-2">{loan.term} mo.</td>
                    <td className="px-3 py-2">₱{loan.amortization.toLocaleString()}</td>
                    <td className="px-3 py-2">{loan.dueDate}</td>
                    <td className="px-3 py-2">₱{loan.remainingBalance.toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <span className={
                        loan.status === "Fully Paid"
                          ? "text-green-600 font-bold"
                          : loan.status === "Partially Paid"
                          ? "text-yellow-600 font-bold"
                          : "text-red-600 font-bold"
                      }>
                        {loan.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {loan.status !== "Fully Paid" && (
                        <button
                          className="bg-green-600 hover:bg-green-700 text-white px-4 py-1 rounded"
                          onClick={() => openPaymentModal(loan)}
                        >
                          Pay
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Payment Modal */}
          {showModal && selectedLoan && (
            <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-30 z-50">
              <div className="bg-white rounded shadow-lg w-full max-w-md p-6 relative">
                <button
                  className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
                  onClick={closeModal}
                >
                  ×
                </button>
                <h2 className="text-xl font-bold mb-4">Loan Payment</h2>
                <div className="mb-2">
                  <strong>Member:</strong> {selectedLoan.memberName}
                </div>
                <div className="mb-2">
                  <strong>Loan Amount:</strong> ₱{selectedLoan.loanAmount.toLocaleString()}
                </div>
                <div className="mb-2">
                  <strong>Interest Rate:</strong> {selectedLoan.interestRate}%
                </div>
                <div className="mb-2">
                  <strong>Term:</strong> {selectedLoan.term} months
                </div>
                <div className="mb-2">
                  <strong>Amortization:</strong> ₱{selectedLoan.amortization.toLocaleString()}
                </div>
                <div className="mb-2">
                  <strong>Due Date:</strong> {selectedLoan.dueDate}
                </div>
                <div className="mb-2">
                  <strong>Current Balance:</strong> ₱{selectedLoan.remainingBalance.toLocaleString()}
                </div>
                <div className="mb-2">
                  <strong>Penalty:</strong> ₱{computePenalty(selectedLoan).toLocaleString()}
                </div>
                <form onSubmit={handlePaymentSubmit}>
                  <div className="mb-2">
                    <label className="block text-sm font-semibold mb-1">Payment Amount</label>
                    <input
                      type="number"
                      min="1"
                      max={selectedLoan.remainingBalance + computePenalty(selectedLoan)}
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                      required
                    />
                  </div>
                  <div className="mb-2">
                    <strong>Updated Balance:</strong> ₱{Math.max(selectedLoan.remainingBalance + computePenalty(selectedLoan) - Number(paymentAmount), 0).toLocaleString()}
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded mt-2"
                  >
                    Submit Payment
                  </button>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Payments;