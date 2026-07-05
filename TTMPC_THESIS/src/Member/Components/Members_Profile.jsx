import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, NavLink, useSearchParams } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { supabase } from "../../supabaseClient";
import { resolveMemberContextFromSessionUser } from "../../utils/sessionIdentity";
import { loadMemberAvatarSignedUrl } from "../../utils/memberAvatar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Activity,
  Search,
  Bell,
  Menu,
  X,
  Pencil,
  User,
  Briefcase,
  Contact2,
  ShieldCheck,
  Lock,
  ChevronRight,
  History,
  Receipt,
  MapPin,
  HeartHandshake,
  Save,
  CheckCircle2,
  AlertCircle,
  Wallet,
  Phone,
  Settings,
} from 'lucide-react';
import SettingsDrawer from './SettingsDrawer';

const PROFILE_SECTIONS = [
  {
    id: 'personal',
    label: 'Personal',
    icon: User,
    description: 'Identity, birth, demographics',
    fields: [
      { key: 'surname', label: 'Surname', required: true },
      { key: 'first_name', label: 'First Name', required: true },
      { key: 'middle_name', label: 'Middle Name' },
      { key: 'maiden_name', label: 'Maiden Name' },
      { key: 'date_of_birth', label: 'Date of Birth', type: 'date' },
      { key: 'place_of_birth', label: 'Place of Birth' },
      { key: 'gender', label: 'Gender', type: 'select', options: ['Male', 'Female'] },
      { key: 'civil_status', label: 'Civil Status', type: 'select', options: ['Single', 'Married', 'Widowed', 'Separated'] },
      { key: 'citizenship', label: 'Citizenship' },
      { key: 'religion', label: 'Religion' },
      { key: 'blood_type', label: 'Blood Type', type: 'select', options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
      { key: 'height', label: 'Height (cm)', type: 'number' },
    ],
  },
  {
    id: 'contact',
    label: 'Contact',
    icon: Phone,
    description: 'Mobile and email',
    fields: [
      { key: 'contact_number', label: 'Mobile Number', type: 'tel', required: true, placeholder: '09xxxxxxxxx' },
      { key: 'email', label: 'Email Address', type: 'email', required: true, placeholder: 'name@example.com' },
    ],
  },
  {
    id: 'address',
    label: 'Address',
    icon: MapPin,
    description: 'Permanent residence',
    fields: [
      { key: 'permanent_address', label: 'Permanent Address', type: 'textarea', fullWidth: true, required: true },
    ],
  },
  {
    id: 'family',
    label: 'Family',
    icon: HeartHandshake,
    description: 'Parents and dependents',
    fields: [
      { key: 'father_name', label: "Father's Name" },
      { key: 'mother_name', label: "Mother's Maiden Name" },
      { key: 'number_of_dependents', label: 'Number of Dependents', type: 'number' },
    ],
  },
  {
    id: 'spouse',
    label: 'Spouse',
    icon: Users,
    description: 'Spouse information',
    fields: [
      { key: 'spouse_name', label: 'Spouse Name' },
      { key: 'spouse_occupation', label: 'Spouse Occupation' },
      { key: 'spouse_date_of_birth', label: 'Spouse Date of Birth', type: 'date' },
    ],
  },
  {
    id: 'employment',
    label: 'Employment',
    icon: Briefcase,
    description: 'Work and income',
    fields: [
      { key: 'employer_name', label: 'Employer Name' },
      { key: 'position', label: 'Position' },
      { key: 'occupation', label: 'Occupation' },
      { key: 'educational_attainment', label: 'Educational Attainment' },
      { key: 'income_source', label: 'Source of Income' },
      { key: 'salary', label: 'Monthly Salary' },
      { key: 'annual_income', label: 'Annual Income' },
      { key: 'other_income', label: 'Other Income' },
      { key: 'tin_number', label: 'TIN Number' },
      { key: 'gsis_number', label: 'GSIS Number' },
    ],
  },
  {
    id: 'financial',
    label: 'Membership',
    icon: Wallet,
    description: 'Cooperative financial standing',
    readOnly: true,
    fields: [
      { key: 'date_of_membership', label: 'Date of Membership' },
      { key: 'BOD_resolution_number', label: 'BOD Resolution No.' },
      { key: 'number_of_shares', label: 'Number of Shares', type: 'number' },
      { key: 'amount', label: 'Amount', type: 'number' },
      { key: 'initial_paid_up_capital', label: 'Initial Paid-Up Capital', type: 'number' },
    ],
  },
];

const isSingleCivilStatus = (value) => {
  return String(value || '').trim().toLowerCase() === 'single';
};

const getVisibleSections = (civilStatus) => {
  if (isSingleCivilStatus(civilStatus)) {
    return PROFILE_SECTIONS.filter((s) => s.id !== 'spouse');
  }
  return PROFILE_SECTIONS;
};

const fieldKeysFromSections = (sections, { editableOnly = false } = {}) =>
  sections
    .filter((s) => (editableOnly ? !s.readOnly : true))
    .flatMap((s) => s.fields.map((f) => f.key));

const normalizeFormValue = (raw) => {
  if (raw === null || raw === undefined) return '';
  return String(raw);
};

const dateInputValue = (raw) => {
  if (!raw) return '';
  const str = String(raw);
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

const isFieldFilled = (value) => {
  if (value === null || value === undefined) return false;
  const str = String(value).trim();
  return str !== '' && str.toLowerCase() !== 'n/a';
};

const validateField = (field, value) => {
  const trimmed = (value ?? '').toString().trim();
  if (field.required && !trimmed) return `${field.label} is required.`;
  if (!trimmed) return null;
  if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return 'Please enter a valid email address.';
  }
  if (field.type === 'tel' && !/^[0-9+\-\s()]{7,20}$/.test(trimmed)) {
    return 'Please enter a valid contact number.';
  }
  if (field.type === 'number' && Number.isNaN(Number(trimmed))) {
    return `${field.label} must be a number.`;
  }
  return null;
};

const styles = `
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes slideInLeft {
    from {
      opacity: 0;
      transform: translateX(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes spin-slow {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .animate-fade-in-up {
    animation: fadeInUp 0.6s ease-out;
  }

  .animate-fade-in {
    animation: fadeIn 0.4s ease-out;
  }

  .animate-slide-in-left {
    animation: slideInLeft 0.5s ease-out;
  }

  .animate-spin-slow {
    animation: spin-slow 1.5s linear;
  }

  .transition-all-smooth {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  tbody tr {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  tbody tr:hover {
    transform: translateX(2px);
  }
`;

const MEMBER_NOTIF_SETTINGS_KEY = 'member_profile_notification_settings';

const Members_Profile = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { addNotification } = useNotification();

  // State for the security toggles
  const [smsNotif, setSmsNotif] = useState(true);
  const [emailNotif, setEmailNotif] = useState(true);
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isTemporaryAccount, setIsTemporaryAccount] = useState(false);
  const [accountTableName, setAccountTableName] = useState('member_account');
  const [resolvedMemberId, setResolvedMemberId] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [passwordStep, setPasswordStep] = useState(1); // 1: enter passwords  2: enter OTP (recovery only)
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [passwordOtp, setPasswordOtp] = useState('');
  const [passwordOtpCooldown, setPasswordOtpCooldown] = useState(0);
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // PDS form state
  const [activeTab, setActiveTab] = useState(PROFILE_SECTIONS[0].id);
  const [formData, setFormData] = useState({});
  const [originalData, setOriginalData] = useState({});
  const [pdsRowId, setPdsRowId] = useState(null);
  const [pdsMembershipId, setPdsMembershipId] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');
  const [saveError, setSaveError] = useState('');
  const [pendingTabChange, setPendingTabChange] = useState(null);
  const [showConfirmSave, setShowConfirmSave] = useState(false);
  const successTimerRef = useRef(null);

  const visibleSections = useMemo(
    () => getVisibleSections(formData.civil_status),
    [formData.civil_status]
  );

  const visibleFieldKeys = useMemo(
    () => fieldKeysFromSections(visibleSections),
    [visibleSections]
  );

  const editableFieldKeys = useMemo(
    () => fieldKeysFromSections(visibleSections, { editableOnly: true }),
    [visibleSections]
  );

  const isDirty = useMemo(() => {
    return editableFieldKeys.some((key) =>
      (formData[key] ?? '') !== (originalData[key] ?? '')
    );
  }, [formData, originalData, editableFieldKeys]);

  const completionPercent = useMemo(() => {
    const filled = visibleFieldKeys.filter((key) => isFieldFilled(formData[key])).length;
    return visibleFieldKeys.length === 0
      ? 0
      : Math.round((filled / visibleFieldKeys.length) * 100);
  }, [formData, visibleFieldKeys]);

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Member Loans", icon: Activity },
    { name: "Statement of Account", icon: Receipt },
    { name: "Loan Lifecycle", icon: History },
    { name: "Member Savings", icon: CreditCard },
    { name: "Member Profile", icon: Users },
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

  // Custom Toggle Switch Component
  const ToggleSwitch = ({ isOn, onToggle }) => (
    <div 
      onClick={onToggle}
      className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${isOn ? 'bg-[#1D6021]' : 'bg-gray-300'}`}
    >
      <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${isOn ? 'translate-x-5' : 'translate-x-0'}`} />
    </div>
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(MEMBER_NOTIF_SETTINGS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed?.smsNotif === 'boolean') setSmsNotif(parsed.smsNotif);
      if (typeof parsed?.emailNotif === 'boolean') setEmailNotif(parsed.emailNotif);
    } catch (_error) {
      // Ignore malformed local preference data.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        MEMBER_NOTIF_SETTINGS_KEY,
        JSON.stringify({ smsNotif, emailNotif })
      );
    } catch (_error) {
      // Ignore persistence failures.
    }
  }, [smsNotif, emailNotif]);

  useEffect(() => {
    let isMounted = true;

    const formatDate = (value) => {
      if (!value) return 'N/A';
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return 'N/A';
      return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    };

    const fetchProfile = async () => {
      try {
        setLoadingProfile(true);
        setProfileError('');

        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        const sessionUser = authData?.user;
        if (!sessionUser?.id) throw new Error('Please sign in again to load your profile.');

        const { account, member: memberRow } = await resolveMemberContextFromSessionUser(sessionUser);
        const authEmail = sessionUser?.email || '';
        const memberId = account?.user_id || sessionUser.id;
        if (!memberId) throw new Error('Please sign in again to load your profile.');

        const temporaryFlag = Boolean(account?.is_temporary);
        const accountTable = account?.table || 'member_account';
        const signedAvatarUrl = await loadMemberAvatarSignedUrl(supabase, sessionUser.id);

        let appRow = null;
        if (account?.membership_id) {
          const { data, error } = await supabase
            .from('member_applications')
            .select('*')
            .eq('membership_id', account.membership_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!error && data) appRow = data;
        }

        if (!appRow && authEmail) {
          const { data, error } = await supabase
            .from('member_applications')
            .select('*')
            .ilike('email', authEmail)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!error && data) appRow = data;
        }

        const membershipNumber = account?.membership_id || memberRow?.membership_number_id || null;
        let pdsRow = null;
        if (membershipNumber) {
          const { data, error } = await supabase
            .from('personal_data_sheet')
            .select('*')
            .eq('membership_number_id', membershipNumber)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!error && data) pdsRow = data;
        }

        // Merge PDS (canonical) over application row as fallback.
        const fieldSource = (key) => {
          if (pdsRow && pdsRow[key] !== null && pdsRow[key] !== undefined && String(pdsRow[key]) !== '') {
            return pdsRow[key];
          }
          if (appRow && appRow[key] !== null && appRow[key] !== undefined) return appRow[key];
          if (memberRow && memberRow[key] !== null && memberRow[key] !== undefined) return memberRow[key];
          return '';
        };

        const seededForm = {};
        fieldKeysFromSections(PROFILE_SECTIONS).forEach((key) => {
          let value = fieldSource(key);
          if (key === 'email' && !value) value = authEmail;
          if ((key === 'first_name' || key === 'surname' || key === 'middle_name') && !value) {
            // member_applications uses last_name for surname
            if (key === 'surname') value = appRow?.surname || appRow?.last_name || '';
          }
          if (PROFILE_SECTIONS.flatMap((s) => s.fields).find((f) => f.key === key)?.type === 'date') {
            value = dateInputValue(value);
          }
          seededForm[key] = normalizeFormValue(value);
        });

        const fullName = [seededForm.first_name, seededForm.middle_name, seededForm.surname]
          .filter(Boolean)
          .join(' ')
          .trim() || 'Member';

        const mapped = {
          fullName,
          memberId: membershipNumber || 'N/A',
          memberType: 'Member',
          joinedDate: formatDate(seededForm.date_of_membership || memberRow?.date_of_membership || memberRow?.created_at || appRow?.created_at),
        };

        if (isMounted) {
          setProfile(mapped);
          setAvatarUrl(signedAvatarUrl || '');
          setIsTemporaryAccount(temporaryFlag);
          setAccountTableName(accountTable);
          setResolvedMemberId(memberId);
          setFormData(seededForm);
          setOriginalData(seededForm);
          setPdsRowId(pdsRow?.personal_data_sheet_id || null);
          setPdsMembershipId(membershipNumber || '');
          setFieldErrors({});
        }
      } catch (err) {
        if (isMounted) {
          setProfileError(err.message || 'Unable to load profile data.');
          setAvatarUrl('');
        }
      } finally {
        if (isMounted) setLoadingProfile(false);
      }
    };

    fetchProfile();
    return () => {
      isMounted = false;
    };
  }, []);

  // OTP resend cooldown timer (password modal).
  useEffect(() => {
    if (passwordOtpCooldown <= 0) return;
    const t = setTimeout(() => setPasswordOtpCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [passwordOtpCooldown]);

  // Auto-open the password modal when the route guard redirects here with
  // ?forcePassword=1 (i.e., the user still has is_temporary=true).
  useEffect(() => {
    if (searchParams.get('forcePassword') === '1') {
      handleOpenChangePassword();
      const next = new URLSearchParams(searchParams);
      next.delete('forcePassword');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

  const handleOpenChangePassword = () => {
    setPasswordError('');
    setPasswordSuccess('');
    setNewPassword('');
    setConfirmPassword('');
    setCurrentPasswordInput('');
    setPasswordOtp('');
    setPasswordStep(1);
    setPasswordRecoveryMode(false);
    setShowPasswordModal(true);
  };

  const handleOpenChangeEmail = () => {
    navigate('/members-profile/change-email');
  };

  const _passwordAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Your session has expired. Please sign in again.');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    };
  };

  // Step 1 — default path: user knows their current password. One-shot update.
  const handleDirectPasswordChange = async (e) => {
    e.preventDefault();
    setPasswordError('');

    if (!currentPasswordInput) {
      setPasswordError('Enter your current password.');
      return;
    }
    if (!newPassword || !confirmPassword) {
      setPasswordError('Please fill in all password fields.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Password confirmation does not match.');
      return;
    }
    if (newPassword === currentPasswordInput) {
      setPasswordError('New password must differ from your current password.');
      return;
    }

    try {
      setUpdatingPassword(true);
      const res = await fetch(`${API_BASE}/api/account/password/change-direct`, {
        method: 'POST',
        headers: await _passwordAuthHeaders(),
        body: JSON.stringify({
          current_password: currentPasswordInput,
          new_password: newPassword,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || 'Unable to update password.');

      setIsTemporaryAccount(false);
      setPasswordSuccess('Password updated successfully.');
      setShowPasswordModal(false);
      setNewPassword('');
      setConfirmPassword('');
      setCurrentPasswordInput('');
    } catch (err) {
      setPasswordError(err.message || 'Unable to update password.');
    } finally {
      setUpdatingPassword(false);
    }
  };

  // Step 1 — recovery path: user forgot current password. Email an OTP first,
  // then collect the new password only after the code is verified.
  const handleRequestPasswordOtp = async (e) => {
    e?.preventDefault?.();
    setPasswordError('');

    try {
      setUpdatingPassword(true);
      const res = await fetch(`${API_BASE}/api/account/password/send-code`, {
        method: 'POST',
        headers: await _passwordAuthHeaders(),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || 'Failed to send verification code.');

      setPasswordStep(2);
      setPasswordOtpCooldown(60);
      setPasswordOtp('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err.message || 'Unable to send code.');
    } finally {
      setUpdatingPassword(false);
    }
  };

  // Step 2: user enters the code + the new password; backend verifies both
  // atomically and updates the password.
  const handleConfirmPasswordOtp = async (e) => {
    e.preventDefault();
    setPasswordError('');

    if (!/^\d{6}$/.test(passwordOtp)) {
      setPasswordError('Enter the 6-digit code.');
      return;
    }
    if (!newPassword || !confirmPassword) {
      setPasswordError('Please fill in your new password.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Password confirmation does not match.');
      return;
    }

    try {
      setUpdatingPassword(true);
      const res = await fetch(`${API_BASE}/api/account/password/verify-and-set`, {
        method: 'POST',
        headers: await _passwordAuthHeaders(),
        body: JSON.stringify({ code: passwordOtp, new_password: newPassword }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || 'Invalid code.');

      setIsTemporaryAccount(false);
      setPasswordSuccess('Password updated successfully.');
      setShowPasswordModal(false);
      setPasswordStep(1);
      setNewPassword('');
      setConfirmPassword('');
      setCurrentPasswordInput('');
      setPasswordOtp('');
    } catch (err) {
      setPasswordError(err.message || 'Unable to update password.');
    } finally {
      setUpdatingPassword(false);
    }
  };

  // ---------- PDS form handlers ----------
  const allFieldsByKey = useMemo(() => {
    const map = {};
    PROFILE_SECTIONS.forEach((section) => {
      section.fields.forEach((field) => {
        map[field.key] = { ...field, sectionId: section.id, sectionReadOnly: Boolean(section.readOnly) };
      });
    });
    return map;
  }, []);

  const handleFieldChange = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    setSaveError('');
    setSaveSuccess('');
  };

  const handleFieldBlur = (key) => {
    const field = allFieldsByKey[key];
    if (!field || field.sectionReadOnly) return;
    const err = validateField(field, formData[key]);
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (err) next[key] = err;
      else delete next[key];
      return next;
    });
  };

  const validateAll = () => {
    const errs = {};
    visibleSections.forEach((section) => {
      if (section.readOnly) return;
      section.fields.forEach((field) => {
        const err = validateField(field, formData[field.key]);
        if (err) errs[field.key] = err;
      });
    });
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleRequestSave = () => {
    setSaveError('');
    setSaveSuccess('');
    if (!validateAll()) {
      setSaveError('Please fix the highlighted fields before saving.');
      return;
    }
    if (!isDirty) {
      setSaveError('No changes to save.');
      return;
    }
    setShowConfirmSave(true);
  };

  const handleConfirmSave = async () => {
    if (!pdsMembershipId) {
      setSaveError('Unable to resolve your Personal Data Sheet record. Please contact the cooperative office.');
      setShowConfirmSave(false);
      return;
    }

    setSavingProfile(true);
    setSaveError('');
    try {
      const updatePayload = {};
      const single = isSingleCivilStatus(formData.civil_status);
      editableFieldKeys.forEach((key) => {
        const field = allFieldsByKey[key];
        let raw = formData[key];
        if (raw === '' || raw === undefined) {
          updatePayload[key] = null;
        } else if (field.type === 'number') {
          const n = Number(raw);
          updatePayload[key] = Number.isFinite(n) ? n : null;
        } else {
          updatePayload[key] = String(raw).trim();
        }
      });
      // Clear spouse fields when civil status is Single so stale data doesn't linger.
      if (single) {
        ['spouse_name', 'spouse_occupation', 'spouse_date_of_birth'].forEach((key) => {
          updatePayload[key] = null;
        });
      }

      const { error: updateError } = await supabase
        .from('personal_data_sheet')
        .update(updatePayload)
        .eq('membership_number_id', pdsMembershipId);

      if (updateError) throw updateError;

      setOriginalData((prev) => ({ ...prev, ...formData }));
      setSaveSuccess('Profile updated successfully.');
      setShowConfirmSave(false);
      if (typeof addNotification === 'function') {
        addNotification('Your personal data sheet has been saved.', 'success');
      }
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => setSaveSuccess(''), 4000);
    } catch (err) {
      setSaveError(err.message || 'Unable to save changes.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDiscardChanges = () => {
    setFormData(originalData);
    setFieldErrors({});
    setSaveError('');
    setSaveSuccess('');
  };

  const handleTabClick = (tabId) => {
    if (tabId === activeTab) return;
    if (isDirty) {
      setPendingTabChange(tabId);
      return;
    }
    setActiveTab(tabId);
  };

  const confirmTabChange = (discard) => {
    if (discard) {
      handleDiscardChanges();
      setActiveTab(pendingTabChange);
    }
    setPendingTabChange(null);
  };

  // If the active tab gets hidden (e.g., user changed civil status to Single
  // while on the Spouse tab), bounce them to the first available section.
  useEffect(() => {
    if (!visibleSections.some((s) => s.id === activeTab)) {
      setActiveTab(visibleSections[0]?.id || 'personal');
    }
  }, [visibleSections, activeTab]);

  // Warn on browser navigation away while dirty.
  useEffect(() => {
    const handler = (e) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  useEffect(() => () => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
  }, []);

  return (
    <div className="relative flex min-h-screen bg-[#F8F9FA] dark:bg-gray-950">
      <style>{styles}</style>
      <SettingsDrawer isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      {isSidebarOpen ? (
        <button
          aria-label="Close sidebar overlay"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-20 bg-black/30 lg:hidden"
        />
      ) : null}
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 transform bg-white dark:bg-gray-900 p-4 flex flex-col border-r border-gray-200 dark:border-gray-800 transition-transform duration-200 ease-out lg:fixed lg:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          aria-label="Close sidebar"
          onClick={() => setIsSidebarOpen(false)}
          className="absolute right-3 top-3 rounded-md p-1 text-gray-500 hover:bg-gray-100 lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold">
              Members Portal
            </p>
          </div>
        </div>
   
        <hr className="w-full border-gray-100 dark:border-gray-800 mb-6" />
   
        <nav className="flex grow flex-col gap-2 text-sm">
          {(() => {
            const routeMap = {
              "Dashboard": "/member-dashboard",
              "Member Loans": "/member-loans",
              "Statement of Account": "/member-statement-of-account",
              "Loan Lifecycle": "/member-lifecycle",
              "Member Profile": "/members-profile",
              "Member Savings": "/member-savings"
            };
       
            return menuItems.map((item) => {
              const Icon = item.icon;
              const to = routeMap[item.name] || `/${item.name.toLowerCase().replace(/\s+/g, '-')}`;
       
              return (
                <NavLink
                  key={item.name}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-[#EAF1EB] text-[#1D6021] font-bold dark:bg-green-900/30 dark:text-green-400'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-[#1D6021] font-medium dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-green-400'
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
            });
          })()}
        </nav>
   
        <button
          onClick={handleSignOut}
          className="mt-auto w-full rounded-lg p-2.5 text-sm bg-[#1D6021] hover:bg-[#154718] text-white font-bold transition-colors"
        >
          Sign out
        </button>
      </aside>
   
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden lg:ml-64">
        {/* Header */}
        <header className="bg-white dark:bg-gray-900 h-16 shadow-sm flex items-center justify-between px-4 sm:px-6 lg:px-8 z-10 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              aria-label="Open sidebar"
              onClick={() => setIsSidebarOpen(true)}
              className="rounded-md p-2 text-gray-600 hover:bg-gray-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-base sm:text-lg font-extrabold text-[#1a4a2f] dark:text-green-400 lg:hidden">Profile</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"/>
            <input 
              type="text"
              className="bg-gray-50 w-64 h-10 rounded-full border border-gray-200 pl-10 pr-4 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D6021] focus:bg-white transition-all dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:bg-gray-800"
              placeholder="Search..."
            />
          </div>
          <LoanNotificationBell role="member" accentClass="bg-[#1D6021]" />

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Open settings"
          >
            <Settings className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 sm:gap-3 border-l border-gray-200 dark:border-gray-700 pl-2 sm:pl-4 cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden border border-gray-300 dark:border-gray-600">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Member Profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
            <p className="hidden sm:block text-sm font-bold text-gray-700 dark:text-gray-200">{profile?.fullName || 'Member'}</p>
          </div>
          </div>
        </header>
   
        {/* Scrollable Page Content */}
        <main className="p-4 sm:p-6 lg:p-8 overflow-y-auto pb-28 lg:pb-0">
          
          {/* Top Profile Header Card */}
          <div className="bg-white dark:bg-gray-900 p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between mb-8 gap-4">
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 text-center sm:text-left">
              <div className="w-20 h-20 rounded-full bg-[#EAF1EB] dark:bg-green-900/30 overflow-hidden border border-gray-200 dark:border-gray-700">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={profile?.fullName || 'Member profile'} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-500 bg-gray-100 dark:bg-gray-800">
                    <User className="w-8 h-8" />
                  </div>
                )}
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white mb-2">{profile?.fullName || 'Loading...'}</h1>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-sm">
                  <span className="bg-[#EAF1EB] text-[#1D6021] dark:bg-green-900/30 dark:text-green-400 px-2.5 py-1 rounded text-[10px] font-extrabold tracking-widest uppercase">
                    {profile?.memberType || 'Member'}
                  </span>
                  <span className="text-gray-400 dark:text-gray-500 font-medium">Joined {profile?.joinedDate || 'N/A'}</span>
                </div>
              </div>
            </div>
            <div className="mt-4 sm:mt-0 flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleOpenChangeEmail}
                className="flex items-center justify-center gap-2 border border-[#1D6021] text-[#1D6021] hover:bg-[#1D6021]/10 transition-colors font-bold rounded-lg px-5 py-2.5 text-sm"
              >
                <Pencil className="w-4 h-4" /> Change Email
              </button>
              <button onClick={handleOpenChangePassword} className="flex items-center justify-center gap-2 bg-[#1D6021] text-white hover:bg-[#154718] transition-colors font-bold rounded-lg px-6 py-2.5 text-sm">
                <Pencil className="w-4 h-4" /> {isTemporaryAccount ? 'Update Password' : 'Account Security'}
              </button>
            </div>
          </div>

          {isTemporaryAccount ? (
            <div className="mb-6 p-4 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-800 font-semibold flex items-center justify-between gap-3">
              <span>Your account is still using a temporary password. Update it now for security.</span>
              <button
                onClick={handleOpenChangePassword}
                className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700"
              >
                Change Password
              </button>
            </div>
          ) : null}

          {profileError ? (
            <div className="mb-6 p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
              {profileError}
            </div>
          ) : null}

          {passwordSuccess ? (
            <div className="mb-6 p-4 rounded-xl border border-green-200 bg-green-50 text-sm text-green-700">
              {passwordSuccess}
            </div>
          ) : null}

          {loadingProfile ? (
            <div className="mb-6 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-600 dark:text-gray-400">
              Loading profile data...
            </div>
          ) : null}

          {/* Completion + status banner */}
          <div className="mb-6 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-gray-900 dark:text-white">Profile Completion</p>
                <p className="text-sm font-extrabold text-[#1D6021]">{completionPercent}%</p>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                <div
                  className="h-full bg-[#1D6021] transition-all duration-500"
                  style={{ width: `${completionPercent}%` }}
                />
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 font-medium">
                {completionPercent === 100
                  ? 'Your profile is complete and up to date.'
                  : 'Complete every section to keep your records audit-ready.'}
              </p>
            </div>
            {isDirty ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-700 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider">
                <AlertCircle className="w-3.5 h-3.5" /> Unsaved changes
              </span>
            ) : null}
          </div>

          {saveSuccess ? (
            <div className="mb-4 p-3 rounded-xl border border-green-200 bg-green-50 text-sm text-green-700 flex items-center gap-2 font-semibold">
              <CheckCircle2 className="w-4 h-4" /> {saveSuccess}
            </div>
          ) : null}
          {saveError ? (
            <div className="mb-4 p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700 flex items-center gap-2 font-semibold">
              <AlertCircle className="w-4 h-4" /> {saveError}
            </div>
          ) : null}

          {/* Tabbed editor */}
          <div className="grid grid-cols-1 lg:grid-cols-[260px,1fr] gap-6">
            {/* Tab nav */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-3 h-fit overflow-x-auto">
              <div className="flex lg:flex-col gap-1 min-w-max lg:min-w-0">
                {visibleSections.map((section) => {
                  const Icon = section.icon;
                  const isActive = activeTab === section.id;
                  const sectionFilled = section.fields.filter((f) => isFieldFilled(formData[f.key])).length;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => handleTabClick(section.id)}
                      className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                        isActive
                          ? 'bg-[#EAF1EB] text-[#1D6021] dark:bg-green-900/30 dark:text-green-400'
                          : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <Icon size={16} strokeWidth={isActive ? 2.5 : 2} />
                        <span className="text-sm font-bold whitespace-nowrap">{section.label}</span>
                      </span>
                      <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${
                        isActive ? 'bg-white dark:bg-gray-800 text-[#1D6021]' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                      }`}>
                        {sectionFilled}/{section.fields.length}
                      </span>
                    </button>
                  );
                })}

                <div className="hidden lg:block border-t border-gray-100 dark:border-gray-800 my-3" />

                <button
                  type="button"
                  onClick={handleOpenChangePassword}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  <Lock size={16} />
                  <span className="text-sm font-bold whitespace-nowrap">Account Security</span>
                </button>
              </div>
            </div>

            {/* Active section panel */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col">
              {visibleSections.filter((s) => s.id === activeTab).map((section) => {
                const Icon = section.icon;
                return (
                  <div key={section.id} className="flex flex-col">
                    <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 bg-[#FAF9FB] dark:bg-gray-800 flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="rounded-lg bg-[#EAF1EB] dark:bg-green-900/30 text-[#1D6021] dark:text-green-400 p-2">
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <h2 className="font-extrabold text-gray-900 dark:text-white text-base">{section.label}</h2>
                          {section.description ? (
                            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5">{section.description}</p>
                          ) : null}
                        </div>
                      </div>
                      {section.readOnly ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider">
                          <ShieldCheck className="w-3 h-3" /> Read-only
                        </span>
                      ) : null}
                    </div>

                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
                      {section.fields.map((field) => {
                        const error = fieldErrors[field.key];
                        const value = formData[field.key] ?? '';
                        const inputClass = `w-full rounded-lg border ${
                          error ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 dark:border-gray-700 focus:ring-[#1D6021]/30 focus:border-[#1D6021]'
                        } bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 transition disabled:bg-gray-50 dark:disabled:bg-gray-700 disabled:text-gray-500 dark:disabled:text-gray-500 disabled:cursor-not-allowed`;
                        const disabled = section.readOnly || loadingProfile;
                        const isFull = field.fullWidth;
                        return (
                          <div key={field.key} className={isFull ? 'md:col-span-2' : ''}>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                              {field.label}{field.required ? <span className="text-red-500 ml-0.5">*</span> : null}
                            </label>
                            {field.type === 'textarea' ? (
                              <textarea
                                value={value}
                                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                                onBlur={() => handleFieldBlur(field.key)}
                                disabled={disabled}
                                rows={3}
                                placeholder={field.placeholder || ''}
                                className={inputClass}
                              />
                            ) : field.type === 'select' ? (
                              <select
                                value={value}
                                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                                onBlur={() => handleFieldBlur(field.key)}
                                disabled={disabled}
                                className={inputClass}
                              >
                                <option value="">Select…</option>
                                {field.options.map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type={field.type || 'text'}
                                value={value}
                                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                                onBlur={() => handleFieldBlur(field.key)}
                                disabled={disabled}
                                placeholder={field.placeholder || ''}
                                className={inputClass}
                              />
                            )}
                            {error ? (
                              <p className="mt-1 text-xs text-red-600 font-semibold flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> {error}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>

                    {!section.readOnly ? (
                      <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          <button
                            type="button"
                            onClick={handleDiscardChanges}
                            disabled={!isDirty || savingProfile}
                            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-semibold hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Discard
                          </button>
                          <button
                            type="button"
                            onClick={handleRequestSave}
                            disabled={!isDirty || savingProfile}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1D6021] text-white text-sm font-semibold hover:bg-[#154718] disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Save className="w-4 h-4" /> Save Changes
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                          These figures are maintained by the cooperative office. Contact the BOD/Manager for adjustments.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Save confirmation modal */}
          {showConfirmSave ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
              <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-extrabold text-gray-900 dark:text-white mb-2">Save profile changes?</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
                  Your updates will be written to your Personal Data Sheet and will be visible across all cooperative modules.
                </p>
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowConfirmSave(false)}
                    disabled={savingProfile}
                    className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                  >
                    Review again
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmSave}
                    disabled={savingProfile}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1D6021] text-white text-sm font-semibold hover:bg-[#154718] disabled:opacity-50"
                  >
                    {savingProfile ? 'Saving…' : (<><Save className="w-4 h-4" /> Confirm Save</>)}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* Unsaved changes warning when switching tabs */}
          {pendingTabChange ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
              <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-extrabold text-gray-900 dark:text-white mb-2">Discard unsaved changes?</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
                  You have unsaved edits in this section. Switching tabs will discard them. Continue?
                </p>
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => confirmTabChange(false)}
                    className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    Keep editing
                  </button>
                  <button
                    type="button"
                    onClick={() => confirmTabChange(true)}
                    className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700"
                  >
                    Discard & switch
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* Notification preferences (kept) */}
          <div className="mt-6 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-[#FAF9FB] dark:bg-gray-800 flex items-center gap-2 text-[#1D6021]">
              <ShieldCheck className="w-5 h-5" />
              <h2 className="font-extrabold text-gray-900 dark:text-white text-base">Notification Preferences</h2>
            </div>
            <div className="p-6 flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-sm">SMS Notifications</h3>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">Receive alerts via phone</p>
                </div>
                <ToggleSwitch isOn={smsNotif} onToggle={() => setSmsNotif(!smsNotif)} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-sm">Email Notifications</h3>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">Receive monthly statements</p>
                </div>
                <ToggleSwitch isOn={emailNotif} onToggle={() => setEmailNotif(!emailNotif)} />
              </div>
            </div>
          </div>

        </main>

        {showPasswordModal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <form
              onSubmit={
                passwordStep === 2
                  ? handleConfirmPasswordOtp
                  : (passwordRecoveryMode ? handleRequestPasswordOtp : handleDirectPasswordChange)
              }
              className="w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-6"
            >
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                {passwordStep === 2
                  ? 'Verify Code & Set New Password'
                  : (passwordRecoveryMode ? 'Recover Password' : 'Change Password')}
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                {passwordStep === 2
                  ? 'Enter the 6-digit code we emailed you, then choose a new password.'
                  : (passwordRecoveryMode
                      ? "We'll email a 6-digit code to your address on file. You can set your new password after verifying the code."
                      : 'Enter your current password and choose a new one.')}
              </p>

              {passwordStep === 1 ? (
                <>
                  {!passwordRecoveryMode && (
                    <>
                      <div className="mb-4">
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Current Password</label>
                        <input
                          type="password"
                          value={currentPasswordInput}
                          onChange={(e) => setCurrentPasswordInput(e.target.value)}
                          autoComplete="current-password"
                          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#1D6021] outline-none"
                          placeholder="Enter your current password"
                        />
                        <button
                          type="button"
                          onClick={() => { setPasswordRecoveryMode(true); setCurrentPasswordInput(''); setNewPassword(''); setConfirmPassword(''); setPasswordError(''); }}
                          className="mt-2 text-xs text-[#1D6021] hover:underline"
                        >
                          Forgot your current password?
                        </button>
                      </div>

                      <div className="mb-4">
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">New Password</label>
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          autoComplete="new-password"
                          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#1D6021] outline-none"
                          placeholder="At least 8 characters"
                        />
                      </div>

                      <div className="mb-4">
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Confirm New Password</label>
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          autoComplete="new-password"
                          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#1D6021] outline-none"
                          placeholder="Repeat new password"
                        />
                      </div>
                    </>
                  )}

                  {passwordRecoveryMode && (
                    <div className="mb-4 text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-lg p-3">
                      A verification code will be sent to your email on file.
                      <button
                        type="button"
                        onClick={() => { setPasswordRecoveryMode(false); setPasswordError(''); }}
                        className="block mt-1 text-[#1D6021] hover:underline"
                      >
                        I remember my current password
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">6-digit Code</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="\d{6}"
                      maxLength={6}
                      value={passwordOtp}
                      onChange={(e) => setPasswordOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-lg tracking-[0.5em] text-center font-bold focus:ring-2 focus:ring-[#1D6021] outline-none"
                      placeholder="000000"
                    />
                    <button
                      type="button"
                      onClick={handleRequestPasswordOtp}
                      disabled={passwordOtpCooldown > 0 || updatingPassword}
                      className="mt-2 text-xs text-[#1D6021] hover:underline disabled:text-gray-400 disabled:no-underline"
                    >
                      {passwordOtpCooldown > 0 ? `Resend code in ${passwordOtpCooldown}s` : 'Resend code'}
                    </button>
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">New Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#1D6021] outline-none"
                      placeholder="At least 8 characters"
                    />
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Confirm New Password</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#1D6021] outline-none"
                      placeholder="Repeat new password"
                    />
                  </div>
                </>
              )}

              {passwordError ? (
                <p className="text-sm text-red-600 mb-4">{passwordError}</p>
              ) : null}

              <div className="flex items-center justify-end gap-3">
                {passwordStep === 2 ? (
                  <button
                    type="button"
                    onClick={() => { setPasswordStep(1); setPasswordOtp(''); setPasswordError(''); }}
                    className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    Back
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowPasswordModal(false)}
                    disabled={isTemporaryAccount}
                    className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                    title={isTemporaryAccount ? 'You must change your temporary password before continuing.' : ''}
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={updatingPassword}
                  className="px-4 py-2 rounded-lg bg-[#1D6021] text-white text-sm font-semibold hover:bg-[#154718] disabled:opacity-50"
                >
                  {updatingPassword
                    ? (passwordStep === 2
                        ? 'Verifying…'
                        : (passwordRecoveryMode ? 'Sending code…' : 'Updating…'))
                    : (passwordStep === 2
                        ? 'Verify & Update Password'
                        : (passwordRecoveryMode ? 'Send Code' : 'Update Password'))}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {/* Bottom Navigation - Mobile Only */}
        <nav className="fixed bottom-0 left-0 right-0 lg:hidden bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 px-2 py-2">
          <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-around gap-1">
              {(() => {
                const routeMap = {
                  "Dashboard": "/member-dashboard",
                  "Member Loans": "/member-loans",
                  "Statement of Account": "/member-statement-of-account",
                  "Loan Lifecycle": "/member-lifecycle",
                  "Member Profile": "/members-profile",
                  "Member Savings": "/member-savings"
                };

                return menuItems.map((item) => {
                  const Icon = item.icon;
                  const to = routeMap[item.name] || `/${item.name.toLowerCase().replace(/\s+/g, '-')}`;

                  return (
                    <NavLink
                      key={item.name}
                      to={to}
                      className={({ isActive }) =>
                        `flex flex-col items-center justify-center px-2.5 py-2 rounded-full transition-all ${
                          isActive
                            ? 'bg-[#1D6021] text-white'
                            : 'text-gray-600 hover:text-[#1D6021] dark:text-gray-400 dark:hover:text-green-400'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon size={20} strokeWidth={isActive ? 2.5 : 2} className="mb-1" />
                          <span className="text-[10px] font-semibold">{item.name.split(' ')[0]}</span>
                        </>
                      )}
                    </NavLink>
                  );
                });
              })()}
            </div>
          </div>
        </nav>
      </div>
    </div>
  );
};

export default Members_Profile;