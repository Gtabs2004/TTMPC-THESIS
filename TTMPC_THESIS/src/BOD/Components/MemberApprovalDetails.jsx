import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Building2, MapPin, Award, Phone, Calendar, Mail, X, Check,
  Download, User, Users, Contact, Briefcase
} from 'lucide-react';
import { supabase } from '../../supabaseClient';

const MemberApprovalDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  // Modal State
  const [activeModal, setActiveModal] = useState(null); // 'reject', 'revise', 'proceed', or null
  const [remarks, setRemarks] = useState('');
  const [sendSms, setSendSms] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);
  const [memberRow, setMemberRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notifying, setNotifying] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState('');
  const [portalRole, setPortalRole] = useState('');
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

  useEffect(() => {
    const fetchMemberDetails = async () => {
      setLoading(true);
      setFetchError('');

      const { data, error } = await supabase
        .from('member_applications')
        .select('*')
        .eq('application_id', id)
        .maybeSingle();

      if (error) {
        setFetchError(error.message || 'Unable to fetch member details.');
        setMemberRow(null);
        setLoading(false);
        return;
      }

      setMemberRow(data || null);
      setLoading(false);
    };

    fetchMemberDetails();
  }, [id]);

  useEffect(() => {
    const resolvePortalRole = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) return;

      for (const table of ['member_account', 'member_accounts']) {
        const byUserId = await supabase.from(table).select('role').eq('user_id', user.id).limit(1).maybeSingle();
        if (!byUserId.error && byUserId.data?.role) {
          setPortalRole(String(byUserId.data.role).trim().toLowerCase());
          return;
        }

        const byEmail = user.email
          ? await supabase.from(table).select('role').ilike('email', user.email).limit(1).maybeSingle()
          : { data: null, error: null };
        if (!byEmail.error && byEmail.data?.role) {
          setPortalRole(String(byEmail.data.role).trim().toLowerCase());
          return;
        }
      }
    };

    resolvePortalRole();
  }, []);

  const formatDate = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const normalizeStatus = (value) => {
    const normalized = (value || '').toString().trim().toLowerCase();
    if (normalized === 'pending') return 'Pending';
    if (normalized === 'rejected') return 'Rejected';
    if (normalized === 'approved') return 'Approved';
    if (normalized === '1st training' || normalized === 'first training' || normalized === 'training 1') return '1st Training';
    if (normalized === '2nd training' || normalized === 'second training' || normalized === 'training 2') return '2nd Training';
    return value || 'Pending';
  };

  const member = useMemo(() => {
    if (!memberRow) return null;

    const fullName = [memberRow.first_name, memberRow.middle_name, memberRow.surname]
      .map((part) => (part || '').trim())
      .filter(Boolean)
      .join(' ');

    // Calculate age if date of birth is available
    let age = 'N/A';
    if (memberRow.date_of_birth) {
      const birthDate = new Date(memberRow.date_of_birth);
      const diff = Date.now() - birthDate.getTime();
      age = `${Math.abs(new Date(diff).getUTCFullYear() - 1970)} Years Old`;
    }

    return {
      id: memberRow.application_id,
      name: fullName || memberRow.full_name || 'Unnamed Applicant',
      status: normalizeStatus(memberRow.application_status),
      date: formatDate(memberRow.created_at),
      
      // Personal Information
      surname: memberRow.surname || 'N/A',
      firstName: memberRow.first_name || 'N/A',
      middleName: memberRow.middle_name || 'N/A',
      gender: memberRow.gender || 'N/A',
      civilStatus: memberRow.civil_status || 'N/A',
      dob: formatDate(memberRow.date_of_birth) || 'N/A',
      age: memberRow.age ? `${memberRow.age} Years Old` : age,
      birthPlace: memberRow.place_of_birth || 'N/A',
      citizenship: memberRow.citizenship || 'Filipino',
      religion: memberRow.religion || 'N/A',
      heightWeight: `${memberRow.height || '-'} cm / ${memberRow.weight || '-'} kg`,
      bloodType: memberRow.blood_type || 'N/A',
      tin_number: memberRow.tin_number || 'N/A',

      // Family Information
      maidenName: memberRow.maiden_name || 'N/A',
      spouseName: memberRow.spouse_name || 'N/A',
      spouseOccupation: memberRow.spouse_occupation || 'N/A',
      number_of_dependents: memberRow.number_of_dependents || '0',

      // Contact & Address
      address: memberRow.permanent_address || 'N/A',
      contact: memberRow.contact_number || 'N/A',
      email: memberRow.email || 'N/A',

      // Educational & Employment
      education: memberRow.educational_attainment || 'N/A',
      occupation: memberRow.occupation || 'N/A',
      position: memberRow.position || 'N/A',
      annualIncome: memberRow.annual_income || 'N/A',
      other_income: memberRow.other_income || 'N/A',
      
      reason: memberRow.rejection_reason || memberRow.remarks || '-',
      row: memberRow,
    };
  }, [memberRow]);

  const getProceedConfig = (status) => {
    if (status === 'Pending') return { title: 'Proceed to 1st Training', nextStatus: '1st Training', button: 'Proceed to 1st Training' };
    if (status === '1st Training') return { title: 'Mark as Official Member', nextStatus: 'Official Member', button: 'Confirm & Complete' };
    if (status === '2nd Training') return { title: 'Mark as Official Member', nextStatus: 'Official Member', button: 'Confirm & Complete' };
    return null;
  };

  const proceedConfig = member ? getProceedConfig(member.status) : null;

  const handlePrint = () => {
  window.print();
  };
  const closeModal = () => {
    if (notifying) return;
    setActiveModal(null);
    setRemarks('');
    setSendSms(true);
    setSendEmail(true);
    setActionError('');
    setNotifyMessage('');
  };

  const sendResendEmail = async (nextStatus) => {
    if (!member?.email || member.email === 'N/A') {
      throw new Error('Member email is missing.');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    let response;
    try {
      response = await fetch(`${apiBaseUrl}/api/send-status-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        signal: controller.signal,
        body: JSON.stringify({
          to_email: member.email,
          member_name: member.name,
          status: nextStatus,
          remarks: remarks.trim() || null,
        }),
      });
    } catch (networkError) {
      if (networkError?.name === 'AbortError') {
        throw new Error('Email API timed out. Status was saved, but email may not have been sent.');
      }
      throw new Error('Failed to fetch email API. Make sure backend is running at VITE_API_BASE_URL.');
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.detail || errorData?.message || 'Email API request failed.');
    }
  };

  const applyStatusUpdate = async (nextStatus) => {
    if (!memberRow) return;
    if (portalRole === 'secretary') {
      setActionError('Secretary has view-only access for membership applications.');
      return;
    }

    if (nextStatus === 'Official Member') {
      const firstTrainingAttendance = String(memberRow?.attendance_status || '').trim().toLowerCase();
      if (memberRow?.application_status === '1st Training' && firstTrainingAttendance !== 'present') {
        setActionError('Only applicants marked Present in 1st Training can be approved as members.');
        return;
      }
    }

    if (nextStatus === 'Official Member') {
      setSaving(true);
      setActionError('');
      setNotifying(true);

      try {
        setNotifyMessage('Finalizing membership and generating membership ID...');

        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData?.user?.id) {
          throw new Error('Unable to verify confirmer account. Please sign in again.');
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);

        let response;
        try {
          response = await fetch(`${apiBaseUrl}/api/confirm-membership`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            signal: controller.signal,
            body: JSON.stringify({
              application_id: memberRow.application_id,
              confirmed_by_user_id: authData.user.id,
            }),
          });
        } catch (networkError) {
          if (networkError?.name === 'AbortError') {
            throw new Error('Membership confirmation timed out. Please check backend logs and retry.');
          }
          throw networkError;
        } finally {
          clearTimeout(timeoutId);
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData?.detail || 'Unable to finalize membership.');
        }

        const result = await response.json().catch(() => ({}));
        const generatedMembershipId = result?.data?.membership_id || 'TTMPC_M_#####';
        const emailResult = result?.data?.email;

        let emailNote = '';
        if (emailResult?.sent === true) {
          emailNote = ' Email notification sent.';
        } else if (emailResult?.reason) {
          emailNote = ` Email notification not sent: ${emailResult.reason}`;
        }

        setNotifyMessage(`Membership created successfully. ID: ${generatedMembershipId}.${emailNote} Returning to member approvals...`);
        setTimeout(() => {
          setSaving(false);
          setNotifying(false);
          closeModal();
          navigate('/member-approvals');
        }, 1500);
      } catch (error) {
        setSaving(false);
        setNotifying(false);
        setActionError(error.message || 'Unable to finalize membership.');
      }

      return;
    }

    setSaving(true);
    setActionError('');

    const payload = {
      application_status: nextStatus,
    };

    if (remarks.trim()) {
      payload.remarks = remarks.trim();
    }

    if (nextStatus === 'Rejected' && remarks.trim()) {
      payload.rejection_reason = remarks.trim();
    }

    const { data, error } = await supabase
      .from('member_applications')
      .update(payload)
      .eq('application_id', memberRow.application_id)
      .select('*')
      .maybeSingle();

    if (error) {
      setActionError(error.message || 'Unable to update application status.');
      setSaving(false);
      return;
    }

    if (data) {
      setMemberRow(data);
    }

    setSaving(false);
    setNotifying(true);
    try {
      if (sendEmail) {
        setNotifyMessage('Sending email notification...');
        await sendResendEmail(nextStatus);
        setNotifyMessage('Email notification sent. Returning to member approvals...');
      } else {
        setNotifyMessage('Email skipped. Returning to member approvals...');
      }
    } catch (emailError) {
      console.error(emailError);
      setNotifyMessage(`Status updated, but email failed: ${emailError.message}`);
    }

    setTimeout(() => {
      setNotifying(false);
      closeModal();
      navigate('/member-approvals');
    }, 1500);
  };

  // Reusable Component for Data Fields
  const InfoField = ({ label, value, isGreen }) => (
    <div className="flex flex-col">
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
        {label}
      </span>
      <span className={`text-sm font-semibold ${isGreen ? 'text-green-700 tracking-widest' : 'text-gray-800'}`}>
        {value}
      </span>
    </div>
  );

  // Reusable Component for Section Cards
  const SectionCard = ({ icon: Icon, title, children }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
      <div className="px-6 py-4 border-b border-gray-50 flex items-center bg-gray-50/50">
        <Icon className="w-5 h-5 text-[#1a4a2f] mr-2" />
        <h2 className="text-sm font-bold text-[#1a4a2f]">{title}</h2>
      </div>
      <div className="p-6">
        {children}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="p-8 bg-gray-50 min-h-screen">
        <button 
          onClick={() => navigate('/member-approvals')}
          className="flex items-center text-sm text-[#1a4a2f] font-semibold mb-4 hover:underline"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Member Approvals
        </button>
        <h1 className="text-3xl font-bold text-[#1a4a2f] mb-8">Loading member details...</h1>
      </div>
    );
  }

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
        <p>{fetchError || `The member with ID ${id} could not be found.`}</p>
      </div>
    );
  }

  const CustomCheckbox = ({ checked, onChange, label }) => (
    <div onClick={onChange} className="flex items-center gap-2 cursor-pointer mb-2 w-fit">
      <div className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${checked ? 'bg-[#1D6021]' : 'border border-gray-300 bg-white'}`}>
        {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
      </div>
      <span className="text-sm text-gray-700">{label}</span>
    </div>
  );

  return (
    <div className="p-8 bg-gray-50 min-h-screen relative max-w-7xl mx-auto">
      
      {/* --- BACK BUTTON --- */}
      <button 
        onClick={() => navigate('/member-approvals')}
        className="flex items-center text-sm text-[#1a4a2f] font-semibold mb-6 hover:underline"
      >
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Member Approvals
      </button>

      {/* --- HEADER --- */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-3xl font-black text-gray-900">{member.name}</h1>
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                member.status === 'Pending' ? 'bg-orange-100 text-orange-600' :
                member.status === 'Official Member' || member.status === 'Approved' ? 'bg-green-100 text-green-700' :
                member.status === '1st Training' ? 'bg-blue-100 text-blue-700' :
                'bg-red-100 text-red-700'
              }`}>
              • {member.status}
            </span>
          </div>
          <div className="text-sm text-gray-500 font-medium">
            Application Submitted: <span className="text-gray-900">{member.date}</span> • Ref: <span className="text-gray-900">{member.id}</span>
          </div>
        </div>
        <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 border border-gray-200 bg-white text-gray-700 font-semibold rounded-lg text-sm shadow-sm hover:bg-gray-50 transition-colors">
          <Download className="w-4 h-4" /> Export Application as PDF
        </button>
      </div>

      {/* --- PERSONAL INFORMATION --- */}
      <SectionCard icon={User} title="Personal Information">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-y-8 gap-x-12">
          <InfoField label="Surname" value={member.surname} />
          <InfoField label="First Name" value={member.firstName} />
          <InfoField label="Middle Name" value={member.middleName} />
          
          <InfoField label="Gender" value={member.gender} />
          <InfoField label="Civil Status" value={member.civilStatus} />
          <InfoField label="Date of Birth" value={member.dob} />
          
          <InfoField label="Age" value={member.age} />
          <InfoField label="Place of Birth" value={member.birthPlace} />
          <InfoField label="Citizenship" value={member.citizenship} />
          
          <InfoField label="Religion" value={member.religion} />
          <InfoField label="Height / Weight" value={member.heightWeight} />
          <InfoField label="Blood Type" value={member.bloodType} />
          
          <div className="md:col-span-3">
            <InfoField label="Tax Identification Number (TIN)" value={member.tin_number} isGreen={true} />
          </div>
        </div>
      </SectionCard>

      {/* --- FAMILY INFORMATION --- */}
      <SectionCard icon={Users} title="Family Information">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-12">
          <InfoField label="Maiden Name (If Applicable)" value={member.maidenName} />
          <InfoField label="Name of Spouse" value={member.spouseName} />
          <InfoField label="Spouse's Occupation" value={member.spouseOccupation} />
          <InfoField label="Number of Dependents" value={member.number_of_dependents} />
        </div>
      </SectionCard>

      {/* --- CONTACT & ADDRESS DETAILS --- */}
      <SectionCard icon={Contact} title="Contact & Address Details">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-12">
          <div className="md:col-span-2">
            <InfoField label="Permanent Address" value={member.address} />
          </div>
          <InfoField label="Contact Number" value={member.contact} />
          <div className="flex flex-col">
             <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
               Email Address
             </span>
             <a href={`mailto:${member.email}`} className="text-sm font-semibold text-[#1a4a2f] underline decoration-1 underline-offset-2">
               {member.email}
             </a>
          </div>
        </div>
      </SectionCard>

      {/* --- EDUCATIONAL & EMPLOYMENT INFORMATION --- */}
      <SectionCard icon={Briefcase} title="Educational & Employment Information">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-12">
          <InfoField label="Educational Attainment" value={member.education} />
          <InfoField label="Occupation / Income Source" value={member.occupation} />
          <InfoField label="Position" value={member.position} />
          <InfoField label="Annual Income" value={`₱ ${member.annualIncome}`} />
          <div className="md:col-span-2">
            <InfoField label="Other Source of Income" value={member.other_income} />
          </div>
        </div>
      </SectionCard>

      {/* --- BOTTOM ACTION BUTTONS --- */}
      {portalRole === 'secretary' && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Secretary access is view-only in this page. You can review pending applications and record attendance in Training Attendance.
        </div>
      )}
      <div className="no-print flex flex-wrap justify-end gap-4 mt-8 bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <button 
          onClick={() => setActiveModal('reject')} 
          disabled={saving || member.status === 'Official Member' || portalRole === 'secretary'}
          className="flex items-center text-[#DC2626] bg-red-50 border border-red-200 hover:bg-red-100 transition-colors font-bold rounded-lg px-6 py-2.5 text-sm"
        >
          <X className="w-4 h-4 mr-2" strokeWidth={2.5} /> Reject Application
        </button>
        
        <button 
          onClick={() => setActiveModal('revise')} 
          disabled={saving || member.status === 'Official Member' || portalRole === 'secretary'}
          className="flex items-center text-[#D97706] bg-yellow-50 border border-yellow-200 hover:bg-yellow-100 transition-colors font-bold rounded-lg px-6 py-2.5 text-sm"
        >
          Return for Revision
        </button>

        {proceedConfig && (
          <button
            onClick={() => setActiveModal('proceed')}
            disabled={saving || portalRole === 'secretary' || (member.status === '1st Training' && String(member.row?.attendance_status || '').toLowerCase() !== 'present')}
            className="flex items-center text-white bg-[#1a4a2f] hover:bg-[#123622] transition-colors font-bold rounded-lg px-6 py-2.5 text-sm shadow-sm"
            title={member.status === '1st Training' && String(member.row?.attendance_status || '').toLowerCase() !== 'present' ? 'Mark attendance as Present in 1st Training before approval.' : ''}
          >
            <Check className="w-4 h-4 mr-2" strokeWidth={2.5} /> {proceedConfig.button}
          </button>
        )}
      </div>


      {/* --- MODALS OVERLAY (Untouched functionality) --- */}
      {activeModal && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm print:!hidden">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 relative animate-in fade-in zoom-in-95 duration-200">
            
            <button 
              onClick={closeModal} 
              disabled={notifying}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors "
            >
              <X className="w-5 h-5" />
            </button>

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

            {activeModal === 'proceed' && (
              <>
                <h3 className="text-xl font-bold text-gray-900 mb-4">{proceedConfig?.title || 'Proceed'}</h3>
                <p className="text-sm text-gray-600 mb-8">
                  You are about to move <span className="font-bold text-gray-900">{member.name}</span> to <span className="font-bold text-gray-900">{proceedConfig?.nextStatus || 'the next stage'}</span>. Proceed?
                </p>
              </>
            )}

            {actionError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {actionError}
              </div>
            )}

            {notifying && (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {notifyMessage}
              </div>
            )}

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

            <div className="flex justify-center gap-3 mt-4">
              <button 
                onClick={closeModal}
                disabled={notifying}
                className="px-6 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium text-sm hover:bg-gray-50 transition-colors w-1/2"
              >
                Cancel
              </button>
              
              {activeModal === 'reject' && (
                <button
                  onClick={() => applyStatusUpdate('Rejected')}
                  disabled={saving || notifying}
                  className="px-6 py-2.5 rounded-lg bg-[#DC2626] hover:bg-red-700 text-white font-medium text-sm transition-colors w-1/2 disabled:opacity-60"
                >
                  {saving ? 'Saving...' : notifying ? 'Sending Email...' : 'Confirm Rejection'}
                </button>
              )}
              {activeModal === 'revise' && (
                <button
                  onClick={() => applyStatusUpdate('For Revision')}
                  disabled={saving || notifying}
                  className="px-6 py-2.5 rounded-lg bg-[#F59E0B] hover:bg-amber-600 text-white font-medium text-sm transition-colors w-1/2 disabled:opacity-60"
                >
                  {saving ? 'Saving...' : notifying ? 'Sending Email...' : 'Send for Revision'}
                </button>
              )}
              {activeModal === 'proceed' && (
                <button
                  onClick={() => proceedConfig && applyStatusUpdate(proceedConfig.nextStatus)}
                  disabled={saving || notifying || !proceedConfig}
                  className="px-6 py-2.5 rounded-lg bg-[#1a4a2f] hover:bg-[#123622] text-white font-medium text-sm transition-colors w-1/2 disabled:opacity-60"
                >
                  {saving ? 'Saving...' : notifying ? 'Sending Email...' : (proceedConfig?.button || 'Confirm')}
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