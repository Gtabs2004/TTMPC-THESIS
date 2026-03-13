import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, MapPin, Award, Phone, Calendar, Mail, X, Check } from 'lucide-react';

const MemberApprovalDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  // Modal State
  const [activeModal, setActiveModal] = useState(null); // 'reject', 'revise', 'proceed', or null
  const [remarks, setRemarks] = useState('');
  const [sendSms, setSendSms] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);

  const mockMemberData = {
    "APP-001": {
      name: "Juan Dela Cruz",
      email: "juan.cruz@email.com",
      employer: "DepEd",
      date: "Oct 12, 2023",
      contact: "0917 123 4567",
      address: "Manila, Philippines",
      classification: "Regular",
      status: "Pending"
    },
     "APP-002": {
      name: "Maria Santos",
      email: "m.santos88@email.com",
      employer: "DepEd",
      date: "Oct 11, 2023",
      contact: "0918 234 5678",
      address: "Quezon City, Philippines",
      classification: "Regular",
      status: "Pending"
    },
    "APP-003": {
      name: "Ricardo Lim",
      email: "ric_lim@email.com",
      employer: "DepEd",
      date: "Oct 11, 2023",
      contact: "0919 345 6789",
      address: "Makati, Philippines",
      classification: "Regular",
      status: "Pending"
    },
    "APP-004": {
      name: "Elena Reyes",
      email: "e.reyes_90@email.com",
      employer: "DepEd",
      date: "Oct 10, 2023",
      contact: "0920 456 7890",
      address: "Pasig, Philippines",
      classification: "Regular",
      status: "Pending"
    },
    "APP-005": {
      name: "Roberto Gomez",
      email: "rob.gomez@email.com",
      employer: "DepEd",
      date: "Oct 10, 2023",
      contact: "0921 567 8901",
      address: "Taguig, Philippines",
      classification: "Regular",
      status: "Pending"
    },
    "APP-014": {
      name: "Pedro Castillo",
      email: "pedro.c@email.com",
      employer: "DepEd",
      date: "Oct 8, 2023",
      contact: "0922 678 9012",
      address: "Caloocan, Philippines",
      classification: "Regular",
      status: "Rejected",
      reason: "Incomplete Documents"
    },
    "APP-015": {
      name: "Luz Miranda",
      email: "luz.m@email.com",
      employer: "DepEd",
      date: "Oct 7, 2023",
      contact: "0923 789 0123",
      address: "Valenzuela, Philippines",
      classification: "Regular",
      status: "Rejected",
      reason: "Failed Background Check"
    },
    "APP-016": {
      name: "Tony Ocampo",
      email: "tony.o@email.com",
      employer: "DepEd",
      date: "Oct 6, 2023",
      contact: "0924 890 1234",
      address: "Parañaque, Philippines",
      classification: "Regular",
      status: "Rejected",
      reason: "Duplicate Application"
    },
  };
    
  

  const member = mockMemberData[id] || mockMemberData["APP-001"]; // Fallback for testing purposes if ID is missing

  const closeModal = () => {
    setActiveModal(null);
    setRemarks('');
    setSendSms(true);
    setSendEmail(true);
  };

  if (!member) {
    return (
      <div className="p-8 bg-gray-50 min-h-screen">
        <button 
          onClick={() => navigate('/member-approvals')}
          className="flex items-center text-sm text-[#1a4a2f] font-semibold mb-4 hover:underline"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Member Approvals
        </button>
        <h1 className="text-3xl font-bold text-[#1a4a2f] mb-8">Member Not Found</h1>
        <p>The member with ID {id} could not be found.</p>
      </div>
    );
  }

  // Helper component for the custom green checkbox
  const CustomCheckbox = ({ checked, onChange, label }) => (
    <div onClick={onChange} className="flex items-center gap-2 cursor-pointer mb-2 w-fit">
      <div className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${checked ? 'bg-[#1D6021]' : 'border border-gray-300 bg-white'}`}>
        {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
      </div>
      <span className="text-sm text-gray-700">{label}</span>
    </div>
  );

  return (
    <div className="p-8 bg-gray-50 min-h-screen relative">
      <button 
        onClick={() => navigate('/member-approvals')}
        className="flex items-center text-sm text-[#1a4a2f] font-semibold mb-4 hover:underline"
      >
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Member Approvals
      </button>
      <h1 className="text-3xl font-bold text-[#1a4a2f] mb-8">{member.name}</h1>
      
      <div className="mb-8">
        <h2 className="text-lg font-bold text-gray-800 mb-4">Application Information</h2>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 grid grid-cols-2 gap-y-6 gap-x-12">
          <div>
            <p className="flex items-center text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1"><Mail className="w-3 h-3 mr-1" /> Email</p>
            <p className="font-medium text-gray-800">{member.email}</p>
          </div>
          <div>
            <p className="flex items-center text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1"><Building2 className="w-3 h-3 mr-1" /> Employer</p>
            <p className="font-medium text-gray-800">{member.employer}</p>
          </div>
          <div>
            <p className="flex items-center text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1"><Phone className="w-3 h-3 mr-1" /> Contact Number</p>
            <p className="font-medium text-gray-800">{member.contact}</p>
          </div>
          <div>
            <p className="flex items-center text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1"><MapPin className="w-3 h-3 mr-1" /> Address</p>
            <p className="font-medium text-gray-800">{member.address}</p>
          </div>
          <div>
            <p className="flex items-center text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1"><Calendar className="w-3 h-3 mr-1" /> Application Date</p>
            <p className="font-medium text-gray-800">{member.date}</p>
          </div>
          <div>
            <p className="flex items-center text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1"><Award className="w-3 h-3 mr-1" /> Classification</p>
            <p className="font-bold text-gray-800">{member.classification}</p>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-lg font-bold text-gray-800 mb-4">Application Status</h2>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">Current Status</p>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                member.status === 'Pending' ? 'bg-yellow-50 text-yellow-600' :
                member.status === 'Approved' ? 'bg-green-50 text-green-600' :
                'bg-red-50 text-red-600'
              }`}>
                {member.status}
              </span>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">Application ID</p>
              <p className="font-medium text-gray-800">{id}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-4 float-end">
        <button 
          onClick={() => setActiveModal('reject')} 
          className="flex items-center text-[#B91C1C] bg-[#FECACA] hover:bg-red-300 transition-colors font-medium rounded-lg px-4 py-2.5 text-sm cursor-pointer"
        >
          <X className="w-4 h-4 mr-1.5" /> Reject Application
        </button>
        <button 
          onClick={() => setActiveModal('revise')} 
          className="flex items-center text-[#B45309] bg-[#FDE68A] hover:bg-yellow-300 transition-colors font-medium rounded-lg px-4 py-2.5 text-sm cursor-pointer"
        >
          Return for Revision
        </button>
        <button 
          onClick={() => setActiveModal('proceed')} 
          className="flex items-center text-white bg-[#1D6021] hover:bg-[#154718] transition-colors font-medium rounded-lg px-4 py-2.5 text-sm cursor-pointer"
        >
          <Check className="w-4 h-4 mr-1.5" /> Proceed to 1st Training
        </button>
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
                <h3 className="text-xl font-bold text-gray-900 mb-4">Reject Membership Application</h3>
                <p className="text-sm text-gray-600 mb-6">
                  Are you sure you want to reject the application of <span className="font-bold text-gray-900">{member.name}</span>? This action is permanent and cannot be undone.
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
                <h3 className="text-xl font-bold text-gray-900 mb-4">Proceed to 1st Training</h3>
                <p className="text-sm text-gray-600 mb-8">
                  You are about to approve <span className="font-bold text-gray-900">{member.name}</span> for the 1st Training Orientation phase. Proceed?
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
                  Confirm & Proceed
                </button>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default MemberApprovalDetails;