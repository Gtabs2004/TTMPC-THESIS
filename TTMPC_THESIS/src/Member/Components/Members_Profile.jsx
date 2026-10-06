import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, NavLink, useSearchParams } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { useMemberSettings } from "../../contex/MemberSettingsContext";
import ConfirmDialog from "../../components/ConfirmDialog";
import { supabase } from "../../supabaseClient";
import { resolveMemberIdentity } from "../../utils/memberIdentity";
import { invalidate } from "../memberDataCache";
import { invalidateSecurityStatus } from "../securityStatusCache";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import ChangePasswordModal from "./ChangePasswordModal";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Activity,
  Search,
  Bell,
  Pencil,
  User,
  Briefcase,
  Contact2,
  ShieldCheck,
  Settings,
  Receipt,
  MapPin,
  HeartHandshake,
  Save,
  CheckCircle2,
  AlertCircle,
  Wallet,
  Phone,
  ChevronDown ,
  Scroll,
  Camera,
  LogOut
} from 'lucide-react';

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
      { key: 'date_of_birth', label: 'Date of Birth', type: 'date', required: true },
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
      { key: 'number_of_dependents', label: 'Number of Dependents', type: 'number', required: true },
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
      { key: 'occupation', label: 'Occupation', required: true },
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

const displayDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
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
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes slideInLeft {
    from { opacity: 0; transform: translateX(-20px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes spin-slow {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .animate-fade-in-up { animation: fadeInUp 0.6s ease-out; }
  .animate-fade-in { animation: fadeIn 0.4s ease-out; }
  .animate-slide-in-left { animation: slideInLeft 0.5s ease-out; }
  .animate-spin-slow { animation: spin-slow 1.5s linear; }
  .transition-all-smooth { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
  tbody tr { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
  tbody tr:hover { transform: translateX(2px); }
`;

const Members_Profile = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const { openSettings } = useMemberSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const { addNotification } = useNotification();

  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarUploadError, setAvatarUploadError] = useState('');
  const fileInputRef = useRef(null);
  const [isTemporaryAccount, setIsTemporaryAccount] = useState(false);
  const [accountTableName, setAccountTableName] = useState('member_account');
  const [resolvedMemberId, setResolvedMemberId] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');

  // PDS form state
  const [activeTab, setActiveTab] = useState(PROFILE_SECTIONS[0].id);
  const [editingSection, setEditingSection] = useState(null); // Tracks inline editing mode
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
      { name: "Dashboard", label: "Dashboard", icon: LayoutDashboard },
      { name: "Apply for Loan", label: "Apply", icon: Scroll },
      { name: "My Loans", label: "Loans", icon: Activity },
      { name: "Statement of Account", label: "Statement", icon: Receipt },
      { name: "Member Profile", label: "Profile", icon: Users },
    ];

  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      await signOut();
      navigate("/memberlogin", { replace: true });
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

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

        const { memberId, avatarUrl: signedAvatarUrl, account, memberRow } = await resolveMemberIdentity();
        if (!memberId) throw new Error('Please sign in again to load your profile.');

        const authEmail = account?.email || '';
        const temporaryFlag = Boolean(account?.is_temporary);
        const accountTable = account?.table || 'member_account';

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

  useEffect(() => {
    if (searchParams.get('forcePassword') === '1') {
      handleOpenChangePassword();
      const next = new URLSearchParams(searchParams);
      next.delete('forcePassword');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The guard sends first-login members here with ?completeProfile=1 when the
  // required fields are still blank. Latch it into state before clearing the
  // param, so the banner survives the URL cleanup and any re-render.
  const [mustCompleteProfile, setMustCompleteProfile] = useState(
    () => searchParams.get('completeProfile') === '1',
  );

  useEffect(() => {
    if (searchParams.get('completeProfile') === '1') {
      setMustCompleteProfile(true);
      const next = new URLSearchParams(searchParams);
      next.delete('completeProfile');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

  const handleOpenChangePassword = () => {
    setPasswordSuccess('');
    setShowPasswordModal(true);
  };

  const handleOpenFilePicker = () => {
    if (uploadingAvatar) return;
    fileInputRef.current?.click();
  };

  const handleAvatarFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user?.id) {
      setAvatarUploadError('Please sign in again before uploading your photo.');
      return;
    }

    const userId = authData.user.id;
    setAvatarUploadError('');
    setUploadingAvatar(true);

    try {
      const extension = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const storagePath = `profiles/${userId}/avatar.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from('Supporting_Documents')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from('profiles')
        .upsert({ id: userId, avatar_url: storagePath }, { onConflict: 'id' });

      if (updateError) throw updateError;

      const { data: signedData, error: signedError } = await supabase.storage
        .from('Supporting_Documents')
        .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

      if (signedError) throw signedError;

      setAvatarUrl(signedData?.signedUrl || '');
      // Drop the dashboard's cached snapshot so the fresh avatar shows up there too.
      invalidate(`member-dashboard:${userId}`);
    } catch (err) {
      setAvatarUploadError(err?.message || 'Unable to upload profile photo.');
    } finally {
      setUploadingAvatar(false);
    }
  };

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
      // The onboarding guard holds new members on this page until the required
      // fields are filled; drop its cached status so a save that completes them
      // releases the member immediately rather than after the cache expires.
      invalidateSecurityStatus();
      setSaveSuccess('Profile information updated successfully.');
      setEditingSection(null); // Return to View Mode
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
    setEditingSection(null); // Cancel Inline Edit Mode
  };

  const handleTabClick = (tabId) => {
    if (tabId === activeTab) {
      // Trying to collapse the current accordion
      if (isDirty) {
        setPendingTabChange('COLLAPSE');
        return;
      }
      setActiveTab(null);
      setEditingSection(null);
      return;
    }
    
    if (isDirty) {
      setPendingTabChange(tabId);
      return;
    }
    
    setEditingSection(null); // Close edit mode when switching smoothly
    setActiveTab(tabId);
  };

  const confirmTabChange = (discard) => {
    if (discard) {
      handleDiscardChanges(); // Resets formData and closes editing section
      setActiveTab(pendingTabChange === 'COLLAPSE' ? null : pendingTabChange);
    }
    setPendingTabChange(null);
  };

  useEffect(() => {
    if (activeTab && !visibleSections.some((s) => s.id === activeTab)) {
      setActiveTab(visibleSections[0]?.id || 'personal');
    }
  }, [visibleSections, activeTab]);

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
            <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-mdark-text-secondary font-bold">
              Members Portal
            </p>
          </div>
        </div>
    
        <hr className="w-full border-gray-100 dark:border-mdark-border mb-6" />
   
        <nav className="flex grow flex-col gap-2 text-sm">
          {(() => {
            const routeMap = {
                          "Dashboard": "/member-dashboard",
                          "Apply for Loan": "/member-apply-loans",
                          "My Loans": "/member-loans",
                          "Statement of Account": "/member-statement-of-account",
                          "Member Profile": "/members-profile", 
                         
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
                        ? 'bg-[#EAF1EB] text-member-green font-bold dark:bg-mdark-accent/15 dark:text-mdark-accent'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-member-green font-medium dark:text-mdark-text-secondary dark:hover:bg-mdark-elevated dark:hover:text-mdark-accent'
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
          className="mt-auto w-full rounded-lg p-2.5 text-sm bg-member-green hover:bg-[#154718] dark:bg-mdark-accent dark:hover:bg-mdark-accent/90 text-white font-bold transition-colors"
        >
          Sign out
        </button>
      </aside>
   
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden lg:ml-64">
        {/* Header */}
        <header className="bg-white dark:bg-mdark-nav h-16 shrink-0 shadow-sm flex items-center justify-between px-4 sm:px-6 lg:px-8 z-10 border-b border-gray-100 dark:border-mdark-border">
          <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-0">
            <h1 className="text-base sm:text-lg font-extrabold text-[#1a4a2f] dark:text-mdark-accent lg:hidden">Profile</h1>
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
   
        <main className="animate-page-in p-4 sm:p-6 lg:p-8 overflow-y-auto pb-28 lg:pb-0">
          
          {/* Profile Header Card */}
          <div className="w-full bg-white dark:bg-mdark-card p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-mdark-border flex flex-col sm:flex-row items-center justify-between mb-8 gap-4">
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 text-center sm:text-left">
              <div className="relative w-20 h-20 shrink-0">
                <div className="w-full h-full rounded-full bg-[#EAF1EB] dark:bg-mdark-accent/15 overflow-hidden border border-gray-200 dark:border-mdark-border">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={profile?.fullName || 'Member profile'} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500 bg-gray-100 dark:bg-mdark-elevated">
                      <User className="w-8 h-8" />
                    </div>
                  )}
                  {uploadingAvatar ? (
                    <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                      <span className="inline-block h-6 w-6 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={handleOpenFilePicker}
                  disabled={uploadingAvatar}
                  aria-label="Change photo"
                  title="Change photo"
                  className="absolute -bottom-0.5 -right-0.5 w-8 h-8 rounded-full bg-member-green text-white border-2 border-white dark:border-mdark-border shadow flex items-center justify-center hover:bg-[#154718] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Camera className="w-4 h-4" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarFileChange}
                />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-mdark-text mb-2">{profile?.fullName || 'Loading...'}</h1>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-sm">
                  <span className="bg-[#EAF1EB] text-member-green dark:bg-mdark-accent/15 dark:text-mdark-accent px-2.5 py-1 rounded text-[10px] font-extrabold tracking-widest uppercase">
                    {profile?.memberType || 'Member'}
                  </span>
                  <span className="text-gray-400 dark:text-mdark-text-muted font-medium">Joined {profile?.joinedDate || 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>
          {avatarUploadError ? (
            <div className="w-full mb-6 p-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 text-sm text-red-700 dark:text-red-400">
              {avatarUploadError}
            </div>
          ) : null}

          {isTemporaryAccount ? (
            <div className="w-full mb-6 p-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 text-sm text-amber-800 dark:text-amber-300 font-semibold flex items-center justify-between gap-3">
              <span>Your account is still using a temporary password. Update it now for security.</span>
              <button
                onClick={handleOpenChangePassword}
                className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700"
              >
                Change Password
              </button>
            </div>
          ) : null}

          {mustCompleteProfile && !isTemporaryAccount ? (
            <div className="w-full mb-6 p-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 text-sm text-amber-800 dark:text-amber-300 font-semibold">
              <p>Complete your profile to finish setting up your account.</p>
              <p className="mt-1 font-medium">
                Fill in your mobile number and permanent address, then save. The rest
                of the portal unlocks once these are on file. Your membership details
                come from the cooperative and need nothing from you.
              </p>
            </div>
          ) : null}

          {profileError ? (
            <div className="w-full mb-6 p-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 text-sm text-red-700 dark:text-red-400">
              {profileError}
            </div>
          ) : null}

          {passwordSuccess ? (
            <div className="w-full mb-6 p-4 rounded-xl border border-green-200 bg-green-50 text-sm text-green-700">
              {passwordSuccess}
            </div>
          ) : null}

          {loadingProfile ? (
            <div className="w-full mb-6 p-4 rounded-xl border border-gray-200 dark:border-mdark-border bg-white dark:bg-mdark-elevated text-sm text-gray-600 dark:text-mdark-text-secondary">
              Loading profile data...
            </div>
          ) : null}

          {/* Profile Completion Bar */}
          <div className="w-full mb-6 bg-white dark:bg-mdark-card rounded-2xl shadow-sm border border-gray-100 dark:border-mdark-border p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-gray-900 dark:text-mdark-text">Profile Completion</p>
                <p className="text-sm font-extrabold text-member-green dark:text-mdark-accent">{completionPercent}%</p>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-mdark-elevated overflow-hidden">
                <div
                  className="h-full bg-member-green dark:bg-mdark-accent transition-all duration-500"
                  style={{ width: `${completionPercent}%` }}
                />
              </div>
              <p className="text-[11px] text-gray-500 dark:text-mdark-text-secondary mt-2 font-medium">
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
            <div className="w-full mb-4 p-3 rounded-xl border border-green-200 bg-green-50 text-sm text-green-700 flex items-center gap-2 font-semibold animate-fade-in">
              <CheckCircle2 className="w-4 h-4" /> {saveSuccess}
            </div>
          ) : null}
          {saveError ? (
            <div className="w-full mb-4 p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700 flex items-center gap-2 font-semibold animate-fade-in">
              <AlertCircle className="w-4 h-4" /> {saveError}
            </div>
          ) : null}

          {/* ACCORDION EDITOR LAYOUT */}
          <div className="w-full">
            <div className="bg-white dark:bg-mdark-card rounded-2xl shadow-sm border border-gray-100 dark:border-mdark-border overflow-hidden flex flex-col divide-y divide-gray-100 dark:divide-mdark-border">
              
              {visibleSections.map((section) => {
                const Icon = section.icon;
                const isActive = activeTab === section.id;
                const isEditing = editingSection === section.id;
                const sectionFilled = section.fields.filter((f) => isFieldFilled(formData[f.key])).length;
                
                return (
                  <div key={section.id} className="flex flex-col">
                    
                    {/* Accordion Header */}
                    <button
                      onClick={() => handleTabClick(section.id)}
                      className={`w-full flex items-center justify-between p-4 sm:p-5 transition-colors ${
                        isActive 
                          ? 'bg-[#EAF1EB]/50 dark:bg-mdark-accent/10' 
                          : 'hover:bg-gray-50 dark:hover:bg-mdark-elevated'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`w-5 h-5 ${isActive ? "text-member-green dark:text-mdark-accent" : "text-gray-500"}`} />
                        <span className={`text-sm font-bold ${isActive ? "text-member-green dark:text-mdark-accent" : "text-gray-700 dark:text-mdark-text-secondary"}`}>
                          {section.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${
                          isActive ? 'bg-white dark:bg-mdark-elevated text-member-green dark:text-mdark-accent' : 'bg-gray-100 dark:bg-mdark-elevated text-gray-500 dark:text-mdark-text-secondary'
                        }`}>
                          {sectionFilled}/{section.fields.length}
                        </span>
                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${isActive ? 'rotate-180' : ''}`} />
                      </div>
                    </button>

                    {/* Expanded Content (View/Edit) */}
                    {isActive && (
                      <div className="p-5 sm:p-7 border-t border-gray-100 dark:border-mdark-border bg-white dark:bg-mdark-card animate-fade-in-up">
                        <div className="flex items-center justify-between mb-6">
                          <p className="text-sm text-gray-500 dark:text-mdark-text-secondary font-medium">{section.description}</p>
                          
                          <div className="flex items-center gap-2">
                            {section.readOnly ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-mdark-elevated text-gray-600 dark:text-mdark-text-secondary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider">
                                <ShieldCheck className="w-3 h-3" /> Read-only
                              </span>
                            ) : !isEditing ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingSection(section.id); }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-member-green text-member-green hover:bg-[#EAF1EB] dark:border-mdark-accent dark:text-mdark-accent dark:hover:bg-mdark-accent/15 transition-colors text-xs font-bold"
                              >
                                <Pencil className="w-3.5 h-3.5" /> Edit 
                              </button>
                            ) : null}
                          </div>
                        </div>

                        {/* Form Fields: View Mode vs Edit Mode */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          {section.fields.map((field) => {
                            const error = fieldErrors[field.key];
                            const value = formData[field.key] ?? '';
                            const inputClass = `w-full rounded-lg border ${
                              error ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 dark:border-mdark-border focus:ring-member-green/30 focus:border-member-green'
                            } bg-white dark:bg-mdark-elevated px-3 py-2.5 text-sm text-gray-900 dark:text-mdark-text outline-none focus:ring-2 transition disabled:bg-gray-50 dark:disabled:bg-gray-700 disabled:text-gray-500 dark:disabled:text-gray-500 disabled:cursor-not-allowed`;
                            const disabled = section.readOnly || loadingProfile;
                            const isFull = field.fullWidth;
                            
                            return isEditing ? (
                              // EDIT MODE
                              <div key={field.key} className={isFull ? 'md:col-span-2' : ''}>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-mdark-text-secondary mb-1.5">
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
                            ) : (
                              // VIEW MODE
                              <div key={field.key} className={`border-b border-gray-50 dark:border-mdark-border pb-3 ${isFull ? 'md:col-span-2' : ''}`}>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-mdark-text-secondary mb-1">
                                  {field.label}
                                </label>
                                <div className="text-sm font-semibold text-gray-900 dark:text-mdark-text">
                                  {isFieldFilled(value) ? (
                                    field.type === 'date' ? displayDate(value) : value
                                  ) : (
                                    <span className="italic text-gray-400 dark:text-mdark-text-muted font-medium">Not provided</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Footer Actions Contextually rendered for editing state */}
                        {isEditing && (
                          <div className="mt-6 pt-5 border-t border-gray-100 dark:border-mdark-border flex flex-col sm:flex-row sm:items-center justify-end gap-3">
                            <button
                              type="button"
                              onClick={handleDiscardChanges}
                              disabled={savingProfile}
                              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-mdark-border text-gray-700 dark:text-mdark-text-secondary text-sm font-semibold hover:bg-gray-100 dark:hover:bg-mdark-elevated disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleRequestSave}
                              disabled={!isDirty || savingProfile}
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-member-green hover:bg-[#154718] dark:bg-mdark-accent dark:hover:bg-mdark-accent/90 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Save className="w-4 h-4" /> Save Changes
                            </button>
                          </div>
                        )}
                        
                      </div>
                    )}
                  </div>
                );
              })}
              
            </div>
          </div>

          {/* Save confirmation modal */}
          <ConfirmDialog
            open={showConfirmSave}
            title="Save profile changes?"
            message="Your updates will be written to your Personal Data Sheet and will be visible across all cooperative modules."
            cancelLabel="Review again"
            confirmLabel="Confirm Save"
            loadingLabel="Saving…"
            tone="default"
            loading={savingProfile}
            onCancel={() => setShowConfirmSave(false)}
            onConfirm={handleConfirmSave}
          />

          {/* Unsaved changes warning when switching tabs */}
          <ConfirmDialog
            open={!!pendingTabChange}
            title="Discard unsaved changes?"
            message="You have unsaved edits in this section. Switching tabs will discard them. Continue?"
            cancelLabel="Keep editing"
            confirmLabel="Discard & switch"
            tone="destructive"
            onCancel={() => confirmTabChange(false)}
            onConfirm={() => confirmTabChange(true)}
          />

          {/* Sign out — mobile only. Desktop keeps the persistent sidebar's
              sign-out button; on mobile that button is a hamburger tap away,
              so the profile page gets its own quick-access one too. */}
          <div className="mt-6 w-full lg:hidden">
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-white dark:bg-mdark-card border border-gray-100 dark:border-mdark-border shadow-sm px-6 py-4 text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>

        </main>

        <ChangePasswordModal
          open={showPasswordModal}
          mustChange={isTemporaryAccount}
          onClose={() => setShowPasswordModal(false)}
          onChanged={() => {
            setIsTemporaryAccount(false);
            setShowPasswordModal(false);
            setPasswordSuccess('Password updated successfully.');
          }}
        />

      </div>
    </div>
  );
};

export default Members_Profile;