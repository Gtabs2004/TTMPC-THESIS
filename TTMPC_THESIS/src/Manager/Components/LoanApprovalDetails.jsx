import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  User, 
  Calculator, 
  BarChart2, 
  Paperclip, 
  FileImage, 
  X, 
  Check, 
  FileEdit 
} from 'lucide-react';

const CustomCheckbox = ({ checked, onChange, label }) => (
  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mb-2 w-fit">
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="w-4 h-4 rounded border-gray-300 text-[#1D6021] focus:ring-[#1D6021] cursor-pointer"
    />
    <span>{label}</span>
  </label>
);

const LoanApprovalDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [activeModal, setActiveModal] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [sendSms, setSendSms] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);

  const member = { name: "Romelyn Delos Reyes" };

  // Mock data - in a real app, you would fetch this based on the ID
  const loanDetails = {
    id: id || "TTMPCL-2026-001",
    memberName: "Romelyn Delos Reyes",
    status: "Pending Review",
    summary: {
      loanType: "Bonus Loan",
      recommendedAmount: "₱20,000.00",
      term: "12 Months",
      migsStatus: "MIGS",
      loanPurpose: "Home Improvement",
      employerPosition: "DepEd (Teacher III)"
    },
    computation: {
      principal: "₱20,000.00",
      interestRate: "1.49% Monthly",
      totalInterest: "₱1,992.04",
      totalPayable: "₱21,832.67",
      monthlyAmortization: "₱1,819.39"
    },
    risk: {
      prevLoans: { value: "3", label: "FULLY PAID", color: "text-green-600" },
      delinquency: { value: "NONE", label: "CLEAN RECORD", color: "text-green-600" },
      consistency: { value: "98%", label: "EXCELLENT", color: "text-green-600" }
    }
  };

  const closeModal = () => {
    setActiveModal(null);
    setRemarks('');
    setSendSms(true);
    setSendEmail(true);
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen relative">
      {/* Back Button */}
      <button 
        onClick={() => navigate('/loan-approval')}
        className="flex items-center text-sm text-[#1D6021] font-semibold mb-6 hover:underline"
      >
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Loan Approvals
      </button>

      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[#1a4a2f] mb-2">Loan Approval Details</h1>
          <p className="text-sm text-gray-500">
            Application ID: <span className="font-bold text-[#1D6021] mr-2">{loanDetails.id}</span> | 
            Member: <span className="font-bold text-gray-800 ml-2">{loanDetails.memberName}</span>
          </p>
        </div>
        <span className="bg-[#FEF08A] text-[#854D0E] px-4 py-1.5 rounded-full text-sm font-bold flex items-center">
          <span className="w-2 h-2 rounded-full bg-[#EAB308] mr-2"></span>
          {loanDetails.status}
        </span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-2 p-8 gap-8">
          
          {/* Left Column */}
          <div className="flex flex-col gap-8">
            {/* Member & Loan Summary */}
            <div>
              <h2 className="flex items-center text-lg font-bold text-gray-800 mb-4">
                <User className="w-5 h-5 mr-2 text-[#1D6021]" /> Member & Loan Summary
              </h2>
              <div className="bg-[#FAF9FB] rounded-xl p-6 grid grid-cols-2 gap-y-6">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Loan Type</p>
                  <p className="font-bold text-gray-800">{loanDetails.summary.loanType}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Recommended Amount</p>
                  <p className="font-bold text-[#1D6021] text-xl">{loanDetails.summary.recommendedAmount}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Term</p>
                  <p className="font-bold text-gray-800">{loanDetails.summary.term}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">MIGS Status</p>
                  <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-bold">
                    {loanDetails.summary.migsStatus}
                  </span>
                </div>
                <div className="col-span-2 border-t border-gray-200 pt-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Loan Purpose</p>
                  <p className="font-bold text-gray-800">{loanDetails.summary.loanPurpose}</p>
                </div>
                <div className="col-span-2 border-t border-gray-200 pt-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Employer / Position</p>
                  <p className="font-bold text-gray-800">{loanDetails.summary.employerPosition}</p>
                </div>
              </div>
            </div>

            {/* Payment Risk Indicators */}
            <div>
              <h2 className="flex items-center text-lg font-bold text-gray-800 mb-4">
                <BarChart2 className="w-5 h-5 mr-2 text-[#1D6021]" /> Payment Risk Indicators
              </h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="border border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Prev Loans</p>
                  <p className="text-2xl font-black text-gray-800 mb-1">{loanDetails.risk.prevLoans.value}</p>
                  <p className={`text-[9px] font-bold uppercase ${loanDetails.risk.prevLoans.color}`}>{loanDetails.risk.prevLoans.label}</p>
                </div>
                <div className="border border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Delinquency</p>
                  <p className="text-xl font-black text-gray-800 mb-1">{loanDetails.risk.delinquency.value}</p>
                  <p className={`text-[9px] font-bold uppercase ${loanDetails.risk.delinquency.color}`}>{loanDetails.risk.delinquency.label}</p>
                </div>
                <div className="border border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Consistency</p>
                  <p className="text-2xl font-black text-gray-800 mb-1">{loanDetails.risk.consistency.value}</p>
                  <p className={`text-[9px] font-bold uppercase ${loanDetails.risk.consistency.color}`}>{loanDetails.risk.consistency.label}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="flex flex-col gap-8">
            {/* Loan Computation Summary */}
            <div>
              <h2 className="flex items-center text-lg font-bold text-gray-800 mb-4">
                <Calculator className="w-5 h-5 mr-2 text-[#1D6021]" /> Loan Computation Summary
              </h2>
              <div className="bg-[#EAF1EB] rounded-xl p-6">
                <div className="space-y-4 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 font-medium">Principal Amount</span>
                    <span className="font-bold text-gray-800">{loanDetails.computation.principal}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 font-medium">Interest Rate</span>
                    <span className="font-bold text-gray-800">{loanDetails.computation.interestRate}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 font-medium">Total Interest</span>
                    <span className="font-bold text-gray-800">{loanDetails.computation.totalInterest}</span>
                  </div>
                </div>
                <div className="border-t border-gray-300 pt-4 mb-4 flex justify-between items-center">
                  <span className="font-bold text-gray-900">Total Payable</span>
                  <span className="font-bold text-gray-900">{loanDetails.computation.totalPayable}</span>
                </div>
                <div className="border-t border-gray-300 pt-4 flex justify-between items-center">
                  <div>
                    <p className="text-[10px] font-bold text-[#1D6021] uppercase tracking-wider">Monthly Amortization</p>
                    <p className="text-[9px] text-gray-500">Estimated salary deduction</p>
                  </div>
                  <span className="text-2xl font-black text-[#1D6021]">{loanDetails.computation.monthlyAmortization}</span>
                </div>
              </div>
            </div>

            {/* Supporting Documents */}
            <div>
              <h2 className="flex items-center text-lg font-bold text-gray-800 mb-4">
                <Paperclip className="w-5 h-5 mr-2 text-[#1D6021]" /> Supporting Documents
              </h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-[#F8F9FA] border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors">
                  <FileImage className="w-6 h-6 text-gray-400 mb-2" />
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Kiosk Submission</p>
                </div>
                <div className="bg-[#F8F9FA] border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors">
                  <FileImage className="w-6 h-6 text-gray-400 mb-2" />
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Payslip 1</p>
                </div>
                <div className="bg-[#F8F9FA] border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors">
                  <FileImage className="w-6 h-6 text-gray-400 mb-2" />
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Payslip 2</p>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="bg-[#F8F9FA] border-t border-gray-200 p-6 flex justify-end gap-4">
          <button 
            onClick={() => setActiveModal('reject')}
            className="flex items-center px-6 py-2.5 rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 font-bold text-sm transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 mr-2" /> Reject Loan
          </button>
          <button 
            onClick={() => setActiveModal('revise')}
            className="flex items-center px-6 py-2.5 rounded-lg border border-yellow-200 text-yellow-700 bg-[#FEF9C3] hover:bg-yellow-200 font-bold text-sm transition-colors cursor-pointer"
          >
            <FileEdit className="w-4 h-4 mr-2" /> Return for Revision
          </button>
          <button 
            onClick={() => setActiveModal('proceed')}
            className="flex items-center px-6 py-2.5 rounded-lg bg-[#1D6021] text-white hover:bg-[#154718] font-bold text-sm transition-colors cursor-pointer"
          >
            <Check className="w-4 h-4 mr-2" /> Approve Loan
          </button>
        </div>
      </div>

      {/* --- Modals Overlay --- */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 relative animate-in fade-in zoom-in-95 duration-200">
            
            {/* Close Button */}
            <button 
              onClick={closeModal} 
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Reject Modal */}
            {activeModal === 'reject' && (
              <>
                <h3 className="text-xl font-bold text-gray-900 mb-4">Reject Loan Application</h3>
                <p className="text-sm text-gray-600 mb-6">
                  Are you sure you want to reject the loan application of <span className="font-bold text-gray-900">{member.name}</span>? This action is permanent and cannot be undone.
                </p>
                
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Reason for Rejection <span className="text-red-500">*</span>
                  </label>
                  <textarea 
                    rows="4"
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-[#1D6021] focus:border-[#1D6021] outline-none"
                    placeholder="Provide a detailed reason for board's decision..."
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                  ></textarea>
                </div>
              </>
            )}

            {/* Revise Modal */}
            {activeModal === 'revise' && (
              <>
                <h3 className="text-xl font-bold text-gray-900 mb-4">Return for Revision</h3>
                <p className="text-sm text-gray-600 mb-6">
                  Please specify the corrections or additional information required from <span className="font-bold text-gray-900">{member.name}</span>.
                </p>
                
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Revision instructions <span className="text-red-500">*</span>
                  </label>
                  <textarea 
                    rows="4"
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-[#1D6021] focus:border-[#1D6021] outline-none"
                    placeholder="Enter the detailed reason for revision or specific instructions for the user..."
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                  ></textarea>
                </div>
              </>
            )}

            {/* Proceed Modal */}
            {activeModal === 'proceed' && (
              <>
                <h3 className="text-xl font-bold text-gray-900 mb-4">Approve Loan Application</h3>
                <p className="text-sm text-gray-600 mb-8">
                  You are about to approve the loan application for <span className="font-bold text-gray-900">{member.name}</span>. Proceed?
                </p>
              </>
            )}

            {/* Shared Notification Options */}
            <div className="mb-8">
              <h4 className="text-[10px] font-bold text-green-700 uppercase tracking-wider mb-3">Notification Options</h4>
              <CustomCheckbox 
                checked={sendSms} 
                onChange={() => setSendSms(!sendSms)} 
                label="Send SMS Notification" 
              />
              <CustomCheckbox 
                checked={sendEmail} 
                onChange={() => setSendEmail(!sendEmail)} 
                label="Send Email Notification" 
              />
            </div>

            {/* Shared Footer Actions */}
            <div className="flex justify-center gap-3 mt-4">
              <button 
                onClick={closeModal}
                className="px-6 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium text-sm hover:bg-gray-50 transition-colors w-1/2"
              >
                Cancel
              </button>
              
              {activeModal === 'reject' && (
                <button className="px-6 py-2.5 rounded-lg bg-[#DC2626] hover:bg-red-700 text-white font-medium text-sm transition-colors w-1/2">
                  Confirm Rejection
                </button>
              )}
              {activeModal === 'revise' && (
                <button className="px-6 py-2.5 rounded-lg bg-[#F59E0B] hover:bg-amber-600 text-white font-medium text-sm transition-colors w-1/2">
                  Send for Revision
                </button>
              )}
              {activeModal === 'proceed' && (
                <button className="px-6 py-2.5 rounded-lg bg-[#1D6021] hover:bg-[#154718] text-white font-medium text-sm transition-colors w-1/2">
                  Confirm Approval
                </button>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default LoanApprovalDetails;