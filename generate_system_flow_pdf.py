#!/usr/bin/env python3
"""
Generate TTMPC System Flow PDF Document
"""

from fpdf import FPDF
from datetime import datetime

class SystemFlowPDF(FPDF):
    def __init__(self):
        super().__init__()
        self.set_auto_page_break(auto=True, margin=15)
        self.add_page()
        self.set_font("Helvetica", size=11)
        self.set_text_color(0, 0, 0)
        
    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(128, 128, 128)
        self.cell(0, 10, f"Page {self.page_no()}", align="C")
    
    def section_title(self, title):
        self.set_font("Helvetica", "B", 14)
        self.set_text_color(0, 51, 102)
        self.cell(0, 10, title, new_x="LMARGIN", new_y="NEXT", border=False)
        self.set_text_color(0, 0, 0)
        self.set_font("Helvetica", size=11)
        self.ln(3)
    
    def subsection_title(self, title):
        self.set_font("Helvetica", "B", 12)
        self.set_text_color(25, 80, 140)
        self.cell(0, 8, title, new_x="LMARGIN", new_y="NEXT", border=False)
        self.set_font("Helvetica", size=11)
        self.set_text_color(0, 0, 0)
        self.ln(2)
    
    def add_flow_text(self, text, indent=0):
        """Add text with optional indentation"""
        if indent > 0:
            self.set_x(self.get_x() + indent)
        self.multi_cell(0, 6, text, border=False)
        self.ln(1)

# Create PDF
pdf = SystemFlowPDF()

# Title Page
pdf.set_font("Helvetica", "B", 20)
pdf.set_text_color(0, 51, 102)
pdf.cell(0, 20, "TTMPC INTEGRATED MANAGEMENT", new_x="LMARGIN", new_y="NEXT", align="C")
pdf.cell(0, 10, "& FINANCE SYSTEM", new_x="LMARGIN", new_y="NEXT", align="C")
pdf.ln(5)

pdf.set_font("Helvetica", "B", 16)
pdf.set_text_color(25, 80, 140)
pdf.cell(0, 10, "END-TO-END PROCESS FLOW", new_x="LMARGIN", new_y="NEXT", align="C")
pdf.ln(10)

pdf.set_font("Helvetica", size=11)
pdf.set_text_color(0, 0, 0)
pdf.multi_cell(0, 6, "Tubungan Teachers' Multi-Purpose Cooperative (TTMPC)\n"
               "Integrated Management and Finance System with Parallel Risk Prediction,\n"
               "Debt Capacity Framework, and Loan Demand Forecasting\n\n"
               f"Generated: {datetime.now().strftime('%B %d, %Y')}")
pdf.ln(10)

# PHASE 1
pdf.add_page()
pdf.section_title("PHASE 1: ENTRY & AUTHENTICATION")

pdf.subsection_title("Non-Members / First-Time Visitors")
pdf.add_flow_text("[1] Website Landing Page")
pdf.add_flow_text("[2] Role Selection (Member vs Non-Member)", indent=10)
pdf.add_flow_text("NON-MEMBER PATH:", indent=10)
pdf.add_flow_text("- View Loan Services (Consolidated, Bonus, Emergency, KOICA)", indent=20)
pdf.add_flow_text("- View Savings Services (Regular, Special Programs)", indent=20)
pdf.add_flow_text("- View Withdrawal/Deposit options", indent=20)
pdf.add_flow_text("MEMBER PATH:", indent=10)
pdf.add_flow_text("- Member Login (existing member)", indent=20)
pdf.add_flow_text("- Sign Up (new applicant)", indent=20)
pdf.add_flow_text("- Or continue as Non-Member", indent=20)

pdf.subsection_title("New Applicant Flow")
pdf.add_flow_text("[1] Sign Up Page", indent=10)
pdf.add_flow_text("[2] Membership Form Submission", indent=10)
pdf.add_flow_text("- Personal Data Sheet (bio, contact, occupation)", indent=20)
pdf.add_flow_text("- Income Information", indent=20)
pdf.add_flow_text("- Supporting Documents Upload", indent=20)
pdf.add_flow_text("[3] Backend Processing", indent=10)
pdf.add_flow_text("- Application recorded in Supabase", indent=20)
pdf.add_flow_text("- Membership ID generated", indent=20)
pdf.add_flow_text("- Status: PENDING_REVIEW", indent=20)
pdf.add_flow_text("[4] BOD Approval Process (handled by Board Officers)", indent=10)

pdf.subsection_title("Existing Member Login")
pdf.add_flow_text("[1] Login Page (Email/Password)", indent=10)
pdf.add_flow_text("[2] Authentication via Supabase", indent=10)
pdf.add_flow_text("- Account lookup in member_account table", indent=20)
pdf.add_flow_text("- Session creation", indent=20)
pdf.add_flow_text("- Role assignment: Member, Bookkeeper, BOD, Manager, Treasurer, Cashier", indent=20)
pdf.add_flow_text("[3] Redirect to Role-Based Dashboard", indent=10)

# PHASE 2
pdf.add_page()
pdf.section_title("PHASE 2: MEMBER PORTAL")

pdf.subsection_title("Member Dashboard - Main Hub")
pdf.add_flow_text("- Personal Profile Summary")
pdf.add_flow_text("- Account Balance Overview")
pdf.add_flow_text("- Active Loans & Schedules")
pdf.add_flow_text("- Savings Accounts Status")
pdf.add_flow_text("- Recent Transactions")

pdf.subsection_title("A. LOAN SERVICES")
pdf.add_flow_text("[1] Member Loan Portal", indent=10)
pdf.add_flow_text("[2] View Available Loan Types:", indent=10)
pdf.add_flow_text("- Consolidated Loan (merges existing loans)", indent=20)
pdf.add_flow_text("- Bonus Loan (performance-based)", indent=20)
pdf.add_flow_text("- Emergency Loan (quick approval)", indent=20)
pdf.add_flow_text("- KOICA Loan (special program)", indent=20)
pdf.add_flow_text("[3] System Auto-Fill Pre-fill Data:", indent=10)
pdf.add_flow_text("- Member personal info, Income records, Employment details", indent=20)
pdf.add_flow_text("[4] Loan Computation Engine:", indent=10)
pdf.add_flow_text("- Calculate Processing Fee", indent=20)
pdf.add_flow_text("- Generate Repayment Schedule", indent=20)
pdf.add_flow_text("- Display Gross vs Net Loan Amount", indent=20)
pdf.add_flow_text("- Show Monthly Amortization", indent=20)
pdf.add_flow_text("[5] Member Reviews & Submits with Digital Signature", indent=10)
pdf.add_flow_text("[6] Confirmation Page & PDF Download", indent=10)

pdf.subsection_title("B. SAVINGS SERVICES")
pdf.add_flow_text("- Regular Savings Account (View Balance, Deposit, Withdraw)")
pdf.add_flow_text("- Special Savings Program (Manage Targeted Savings)")
pdf.add_flow_text("- Statement of Account (View historical transactions)")

# PHASE 3
pdf.add_page()
pdf.section_title("PHASE 3: ADMINISTRATIVE WORKFLOWS")

pdf.subsection_title("BOD (Board of Directors) Portal")
pdf.add_flow_text("Member Approval Management:", indent=10)
pdf.add_flow_text("- Review pending applications", indent=20)
pdf.add_flow_text("- Verify personal data", indent=20)
pdf.add_flow_text("- Approve/Reject membership", indent=20)
pdf.add_flow_text("Training Attendance Tracking:", indent=10)
pdf.add_flow_text("- Record member attendance", indent=20)
pdf.add_flow_text("- Approve completion status", indent=20)
pdf.add_flow_text("- Determine membership eligibility", indent=20)

pdf.subsection_title("BOOKKEEPER Portal")
pdf.add_flow_text("Member Records Management:", indent=10)
pdf.add_flow_text("- Full member database, Search & filter capabilities", indent=20)
pdf.add_flow_text("Loan Application Processing:", indent=10)
pdf.add_flow_text("- Review incoming applications", indent=20)
pdf.add_flow_text("- Pre-assess loan feasibility", indent=20)
pdf.add_flow_text("- Submit to MIGS for scoring", indent=20)
pdf.add_flow_text("MIGS (Automated Scoring System):", indent=10)
pdf.add_flow_text("- Multi-criteria evaluation (Score 0-100)", indent=20)
pdf.add_flow_text("- Risk prediction using Logistic Regression", indent=20)
pdf.add_flow_text("Loan Approval Processing:", indent=10)
pdf.add_flow_text("- Review scores and risk predictions", indent=20)
pdf.add_flow_text("- Forward to Manager for final decision", indent=20)
pdf.add_flow_text("Payment Records & Accounting:", indent=10)
pdf.add_flow_text("- Record payments, GL entries, Account reconciliation", indent=20)

pdf.subsection_title("MANAGER Portal")
pdf.add_flow_text("- Loan Approval Authority (Final decision making)")
pdf.add_flow_text("- Member Management (Status updates, Co-maker relationships)")

pdf.subsection_title("TREASURER Portal")
pdf.add_flow_text("- Loan Disbursement Processing (Check/transfer payments)")
pdf.add_flow_text("- Treasurer Accounting (Record transactions, Cash management)")
pdf.add_flow_text("- Final Approval Queue (Verification before disbursal)")

# PHASE 4
pdf.add_page()
pdf.section_title("PHASE 4: BACKEND PROCESSING & INTELLIGENCE")

pdf.subsection_title("Supabase Database Layer")
pdf.add_flow_text("Core Tables:")
pdf.add_flow_text("member_account, member_applications, personal_data_sheet", indent=10)
pdf.add_flow_text("member_profile, member_savings_accounts", indent=10)
pdf.add_flow_text("loan_applications, loan_payments, loan_schedules", indent=10)
pdf.add_flow_text("attendance_logs, grocery_transactions", indent=10)

pdf.subsection_title("Intelligent Decision Support Features")
pdf.add_flow_text("MIGS Scoring Engine:", indent=10)
pdf.add_flow_text("- Multi-Criteria Evaluation (Personal, Income, Debt, Payment History)", indent=20)
pdf.add_flow_text("- Output: Score 0-100 with risk classification", indent=20)
pdf.add_flow_text("Parallel Risk Prediction:", indent=10)
pdf.add_flow_text("- Logistic Regression Model", indent=20)
pdf.add_flow_text("- Probability of default calculation", indent=20)
pdf.add_flow_text("Debt Capacity Framework:", indent=10)
pdf.add_flow_text("- Calculate member's ability to repay", indent=20)
pdf.add_flow_text("- Assess net take-home pay and total debt", indent=20)
pdf.add_flow_text("- Repayment Stress Index visualization", indent=20)
pdf.add_flow_text("Loan Demand Forecasting:", indent=10)
pdf.add_flow_text("- Time-Series Analysis for seasonal patterns", indent=20)

# PHASE 5
pdf.add_page()
pdf.section_title("PHASE 5: LOAN LIFECYCLE (DETAILED)")

pdf.subsection_title("Complete Loan Journey")
flow_steps = [
    "[1] LOAN APPLICATION: Member submits form with auto-filled data",
    "[2] BOOKKEEPER REVIEW: Review documents, Verify info, Submit to MIGS",
    "[3] AUTOMATED MIGS SCORING: Evaluation, Score 0-100, Risk level assigned",
    "[4] MANAGER APPROVAL: Final decision based on scores and risk prediction",
    "[5] TREASURER VERIFICATION: Final check, Fund availability, Authorize disbursal",
    "[6] CASHIER DISBURSAL: Release funds to member, Record transaction",
    "[7] LOAN MANAGEMENT: Track amortization, Monitor payment schedules",
    "[8] PAYMENT COLLECTION: Cashier records payments, Update balances",
    "[9] LOAN COMPLETION: Balance = 0, Mark as paid in full, Archive"
]

for step in flow_steps:
    pdf.add_flow_text(step, indent=10)

# PHASE 6
pdf.add_page()
pdf.section_title("PHASE 6: SAVINGS & CBU LIFECYCLE")

pdf.subsection_title("Savings Management Flow")
pdf.add_flow_text("[1] Member Initiates Deposit/Withdrawal", indent=10)
pdf.add_flow_text("[2] Goes to Cashier (at cooperative office)", indent=10)
pdf.add_flow_text("DEPOSIT Process:", indent=10)
pdf.add_flow_text("- Verify member ID", indent=20)
pdf.add_flow_text("- Accept cash/check", indent=20)
pdf.add_flow_text("- Record in system, Update balance", indent=20)
pdf.add_flow_text("- Issue receipt", indent=20)
pdf.add_flow_text("WITHDRAWAL Process:", indent=10)
pdf.add_flow_text("- Verify ID, Check balance", indent=20)
pdf.add_flow_text("- Record withdrawal, Update balance", indent=20)
pdf.add_flow_text("- Disburse cash, Issue receipt", indent=20)

pdf.subsection_title("Cooperative Business Unit (Grocery) Operations")
pdf.add_flow_text("[1] Member buys at CBU (Grocery)", indent=10)
pdf.add_flow_text("[2] Transaction recorded via POS system", indent=10)
pdf.add_flow_text("[3] Reconciliation (Cashier/Bookkeeper):", indent=10)
pdf.add_flow_text("- POS data synced to main system", indent=20)
pdf.add_flow_text("- Grocery ledger updated", indent=20)
pdf.add_flow_text("- Cross-check transactions", indent=20)
pdf.add_flow_text("[4] Financial Impact:", indent=10)
pdf.add_flow_text("- Grocery credit tracked in member account", indent=20)
pdf.add_flow_text("- Offset against savings/loan", indent=20)
pdf.add_flow_text("- Used in debt capacity calculations", indent=20)

pdf.subsection_title("New Member Membership Lifecycle")
membership_steps = [
    "[1] APPLICATION: Fill membership form with personal data",
    "[2] BOD REVIEW & TRAINING: Verify application, Require 1st Training",
    "[3] MEMBERSHIP APPROVAL: BOD votes, If training attended: Approve",
    "[4] ACTIVE MEMBER: ID assigned, Account activated, Services available"
]

for step in membership_steps:
    pdf.add_flow_text(step, indent=10)

# PHASE 7
pdf.add_page()
pdf.section_title("PHASE 7: REPORTING & ANALYTICS")

pdf.subsection_title("Available Reports")
pdf.add_flow_text("Bookkeeper Reports:", indent=10)
pdf.add_flow_text("- Member Records, Loan Applications, MIGS Scores", indent=20)
pdf.add_flow_text("- Payment Collections, Savings Transactions", indent=20)
pdf.add_flow_text("- Accounting Reports, Audit Trail", indent=20)

pdf.add_flow_text("Manager/Treasurer Reports:", indent=10)
pdf.add_flow_text("- Loan Portfolio, Default Risk Summary", indent=20)
pdf.add_flow_text("- Disbursement Report, Collection Status", indent=20)
pdf.add_flow_text("- Financial Position Report", indent=20)

pdf.add_flow_text("Strategic Analytics (Decision Support):", indent=10)
pdf.add_flow_text("- Loan Demand Forecast, Member Risk Dashboard", indent=20)
pdf.add_flow_text("- Debt Stress Index, Default Probability Ranking", indent=20)

# KEY DECISION POINTS
pdf.add_page()
pdf.section_title("KEY DECISION POINTS IN THE SYSTEM")

decisions = [
    ("1. NEW APPLICANT?", [
        "YES: Start Membership Application > BOD Approval > Account Created",
        "NO: Login > Go to Role Dashboard"
    ]),
    ("2. MEMBER WANTS LOAN?", [
        "Pre-assessment > MIGS Scoring > Risk Analysis",
        "If Risk HIGH: Reject or require co-maker",
        "If Risk ACCEPTABLE: Manager Approval > Disbursement"
    ]),
    ("3. LOAN PAYMENT DUE?", [
        "On time: Record payment, reduce balance",
        "Late: Flag delinquency, send reminder",
        "Default: Escalate, trigger collection procedures"
    ]),
    ("4. SAVING WITHDRAWAL REQUEST?", [
        "Balance sufficient: Process withdrawal",
        "Insufficient funds: Deny or inform member"
    ]),
    ("5. GROCERY TRANSACTION?", [
        "Member has credit: Deduct from account",
        "No credit: Reject transaction",
        "Reconcile in main system regularly"
    ])
]

for decision_title, options in decisions:
    pdf.subsection_title(decision_title)
    for option in options:
        pdf.add_flow_text(option, indent=10)
    pdf.ln(2)

# SYSTEM ARCHITECTURE
pdf.add_page()
pdf.section_title("SYSTEM ARCHITECTURE & DATA FLOW")

pdf.subsection_title("Technology Stack")
pdf.add_flow_text("Frontend: React + Vite (Single Page Application)")
pdf.add_flow_text("Backend: FastAPI (Python-based REST API)")
pdf.add_flow_text("Database: Supabase PostgreSQL (Real-time, Cloud-hosted)")
pdf.add_flow_text("Authentication: Supabase Auth (Email/Password)")
pdf.add_flow_text("External Services: Resend API (Email), POS System (Grocery)")

pdf.subsection_title("Data Flow Architecture")
pdf.add_flow_text("[1] Frontend Components (React)", indent=10)
pdf.add_flow_text("[2] API calls via Supabase Client", indent=10)
pdf.add_flow_text("[3] FastAPI Backend (main.py)", indent=10)
pdf.add_flow_text("- Business Logic Processing", indent=20)
pdf.add_flow_text("- Risk calculations, PDF generation", indent=20)
pdf.add_flow_text("[4] Supabase PostgreSQL Database", indent=10)
pdf.add_flow_text("- Persistent storage, Data relationships", indent=20)
pdf.add_flow_text("[5] External Services:", indent=10)
pdf.add_flow_text("- Resend API (Email notifications)", indent=20)
pdf.add_flow_text("- POS System (Grocery transactions)", indent=20)

pdf.subsection_title("Role-Based Access Control")
roles = {
    "Member": "View own loans/savings, Submit applications, Payment tracking",
    "Bookkeeper": "Process applications, MIGS scoring, Manage records, Reports",
    "BOD": "Approve memberships, Track training, Manage lifecycle",
    "Manager": "Loan approval authority, Final decisions, Member management",
    "Treasurer": "Loan disbursement, Financial control, Payment processing",
    "Cashier": "Savings deposits/withdrawals, Loan payments, POS, Daily cash"
}

for role, desc in roles.items():
    pdf.add_flow_text(f"{role}: {desc}", indent=10)

# SYSTEM CAPABILITIES
pdf.add_page()
pdf.section_title("INTELLIGENT SYSTEM CAPABILITIES")

capabilities = [
    ("Parallel Risk Prediction", "Logistic Regression to estimate default probability"),
    ("Payment Capability Assessment", "Evaluates ability to repay based on net income"),
    ("MIGS Scoring Engine", "Multi-criteria evaluation (0-100 scale)"),
    ("Loan Demand Forecasting", "Time-Series Analysis for seasonal patterns"),
    ("Repayment Stress Index", "Visual tool for monitoring financial burden"),
    ("Multi-Loan Tracking", "Concurrent loans with aggregate debt monitoring"),
    ("Automated Decision Support", "Reduces bias, speeds approval, ensures consistency")
]

for idx, (capability, description) in enumerate(capabilities, 1):
    pdf.add_flow_text(f"{idx}. {capability}", indent=10)
    pdf.add_flow_text(description, indent=15)
    pdf.ln(1)

# Summary
pdf.add_page()
pdf.section_title("SYSTEM SUMMARY")

pdf.set_font("Helvetica", size=11)
summary_text = (
    "The TTMPC Integrated Management and Finance System is a comprehensive Decision Support System (DSS) "
    "that transforms manual cooperative operations into a centralized, intelligent, and predictive platform.\n\n"
    
    "CORE FEATURES:\n"
    "- Complete member lifecycle management from application to active status\n"
    "- Multi-type loan management (Consolidated, Bonus, Emergency, KOICA)\n"
    "- Intelligent risk assessment and default prediction\n"
    "- Automated MIGS scoring engine (0-100 scale)\n"
    "- Debt capacity and repayment stress analysis\n"
    "- Savings account management and transaction tracking\n"
    "- Grocery POS integration and reconciliation\n"
    "- Role-based access control (6 user roles)\n"
    "- Comprehensive reporting and analytics\n"
    "- Real-time decision support for loan approvals\n\n"
    
    "PROCESS FLOW:\n"
    "All transactions flow through: Entry > Authentication > Role Portal > Transaction Processing > "
    "Backend Intelligence > Database Storage > Reports > Member Notifications\n\n"
    
    "KEY DIFFERENTIATORS:\n"
    "This system combines operational management, risk prediction, financial analysis, and strategic "
    "forecasting into a single, cohesive decision support system designed specifically for cooperative "
    "financial management.\n"
)

pdf.multi_cell(0, 6, summary_text)

# Save PDF
output_path = r"c:\Users\ACER\Desktop\TTMPC-THESIS\TTMPC_System_End_to_End_Flow.pdf"
pdf.output(output_path)
print(f"Success: PDF generated at {output_path}")
print(f"Total pages: {pdf.page}")
