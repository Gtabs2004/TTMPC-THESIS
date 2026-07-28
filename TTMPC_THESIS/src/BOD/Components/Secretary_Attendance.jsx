import React, { useEffect, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import ConfirmDialog from "../../components/ConfirmDialog";
import { supabase } from "../../supabaseClient";
import { resolveAccountFromSessionUser } from "../../utils/sessionIdentity";
import { 
  LayoutDashboard, 
  Users, 
  CreditCard,
  CalendarCheck,
  Search,
  Bell,
  UserPlus,
  ClipboardList,
  BadgeCheck,
  Download,
  Archive,
  CalendarDays,
  Clock3,
  FileText,
  ShieldCheck,
    AlertTriangle,
} from 'lucide-react';
import logo from "../../assets/img/ttmpc logo.png";
import NotificationBell from "./NotificationBell";



const Secretary_Attendance = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  
  // --- STATE ---
  const [activeTab, setActiveTab] = useState("Training");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [pendingAttendanceChange, setPendingAttendanceChange] = useState(null);
  const [editedRemark, setEditedRemark] = useState("");
  const [editedMeetingDate, setEditedMeetingDate] = useState("");
  const [editedMeetingTime, setEditedMeetingTime] = useState("");
  const [tableData, setTableData] = useState({
    Pending: [],
    Training: [],
    "For Revision": [],
    "Reschedule Training": [],
  });
  const [portalRole, setPortalRole] = useState("");
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
  const [rescheduleMember, setRescheduleMember] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleNote, setRescheduleNote] = useState("");
  const [savingReschedule, setSavingReschedule] = useState(false);
  const [lockConfirm, setLockConfirm] = useState(null); // { member } when confirming lock-in
  const [isRescheduleConfirmOpen, setIsRescheduleConfirmOpen] = useState(false);

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

  const menuItems = [
     {
       section: "BOD",
       items: [
         { name: "Dashboard", icon: LayoutDashboard },
         { name: "Member Approvals", icon: Users },
         { name: "Loan Approvals", icon: ShieldCheck },
         { name: "Loan Ledger", icon: CreditCard },
         { name: "Manage Member", icon: Users },
         { name: "Loan Policies", icon: FileText },
       ],
     },
     {
       section: "SECRETARY",
       items: [
         { name: "Training Attendance", icon: CalendarCheck },
         { name: "General Assembly", icon: CalendarDays },
         { name: "Membership Records", icon: Archive },
       ],
     },
   ];
 
  const normalizeStatus = (value) => {
    const normalized = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ");

    if (normalized === "pending") return "Pending";
    if (["training", "1st training", "first training", "training 1", "2nd training", "second training", "training 2"].includes(normalized)) return "Training";
    if (["for revision", "revision"].includes(normalized)) return "For Revision";
    if (["member", "official member", "approved", "completed", "active"].includes(normalized)) return null;
    // Keep legacy rejected records visible under revision workflow.
    if (normalized === "rejected") return "For Revision";
    return null;
  };

  const formatDisplayDate = (value) => {
    if (!value) return "Not scheduled";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not scheduled";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const formatDisplayTime = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const formatDateInputValue = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const formatTimeInputValue = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  };

  const buildRecordedAt = (dateValue, timeValue, fallbackValue = new Date()) => {
    const baseDate = dateValue ? new Date(`${dateValue}T00:00:00`) : new Date(fallbackValue);

    if (Number.isNaN(baseDate.getTime())) {
      return new Date().toISOString();
    }

    if (timeValue) {
      const [hours, minutes] = timeValue.split(":");
      baseDate.setHours(Number(hours) || 0, Number(minutes) || 0, 0, 0);
    }

    return baseDate.toISOString();
  };

  const getThirdSaturday = (year, monthIndex) => {
    const firstDay = new Date(year, monthIndex, 1);
    const dayOfWeek = firstDay.getDay();
    const firstSaturdayDate = dayOfWeek === 6 ? 1 : 1 + ((6 - dayOfWeek + 7) % 7);
    return new Date(year, monthIndex, firstSaturdayDate + 14);
  };

  const getRuleSchedule = (referenceDateInput) => {
    const referenceDate = new Date(referenceDateInput);
    const fallbackDate = Number.isNaN(referenceDate.getTime()) ? new Date() : referenceDate;
    const year = fallbackDate.getFullYear();
    const marchSchedule = getThirdSaturday(year, 2);
    const septemberSchedule = getThirdSaturday(year, 8);
    if (fallbackDate <= marchSchedule) return marchSchedule;
    if (fallbackDate <= septemberSchedule) return septemberSchedule;
    return getThirdSaturday(year + 1, 2);
  };

  const getNextRuleSchedule = (currentScheduleDate) => {
    const date = new Date(currentScheduleDate);
    if (Number.isNaN(date.getTime())) return getRuleSchedule(new Date().toISOString());
    const year = date.getFullYear();
    const month = date.getMonth();
    if (month === 2) return getThirdSaturday(year, 8);
    if (month === 8) return getThirdSaturday(year + 1, 2);
    return getRuleSchedule(date.toISOString());
  };

  const resolvePortalRole = async () => {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) return "";

    const account = await resolveAccountFromSessionUser(user);
    if (account?.role) return String(account.role).trim().toLowerCase();

    return "";
  };

  const fetchAttendanceRows = async () => {
    const [{ data, error }, logsResponse, rescheduleLogsResponse] = await Promise.all([
      supabase
        .from("member_applications")
        .select("application_id, first_name, middle_name, surname, email, created_at, application_status, attendance_status, remarks")
        .order("created_at", { ascending: false }),
      supabase
        .from("attendance_logs")
        .select("application_id, attendance_status, remarks, meeting_date, recorded_at, training_stage, is_locked")
        .eq("training_stage", "Training")
        .order("recorded_at", { ascending: false }),
      supabase
        .from("attendance_logs")
        .select("application_id, attendance_status, remarks, meeting_date, recorded_at, training_stage, is_locked")
        .eq("training_stage", "Rescheduled Training")
        .order("recorded_at", { ascending: false }),
    ]);

    if (error) {
      addNotification(error.message || "Unable to load attendance records.", "error");
      return;
    }

    if (logsResponse.error) {
      console.warn("Unable to load attendance_logs entries:", logsResponse.error.message || logsResponse.error);
    }
    if (rescheduleLogsResponse?.error) {
      console.warn("Unable to load reschedule logs:", rescheduleLogsResponse.error.message || rescheduleLogsResponse.error);
    }

    const attendanceLogMap = new Map();
    for (const log of logsResponse.data || []) {
      if (!attendanceLogMap.has(log.application_id)) {
        attendanceLogMap.set(log.application_id, log);
      }
    }

    const rescheduleLogMap = new Map();
    for (const log of rescheduleLogsResponse?.data || []) {
      if (!rescheduleLogMap.has(log.application_id)) {
        rescheduleLogMap.set(log.application_id, log);
      }
    }

    const grouped = {
      Pending: [],
      Training: [],
      "For Revision": [],
      "Reschedule Training": [],
    };

    for (const row of data || []) {
      const status = normalizeStatus(row.application_status);

      const fullName = [row.first_name, row.middle_name, row.surname]
        .map((part) => String(part || "").trim())
        .filter(Boolean)
        .join(" ") || "Unnamed Applicant";

      const attendanceLog = attendanceLogMap.get(row.application_id);
      const firstTrainingSchedule = getRuleSchedule(row.created_at || new Date().toISOString());
      const scheduleDate = attendanceLog?.meeting_date
        ? new Date(attendanceLog.meeting_date)
        : firstTrainingSchedule;
      const scheduleTime = attendanceLog?.recorded_at ? formatDisplayTime(attendanceLog.recorded_at) : "";

      const baseRow = {
        id: row.application_id,
        applicationId: row.application_id,
        name: fullName,
        email: row.email || "-",
        schedule: attendanceLog
          ? `${formatDisplayDate(scheduleDate.toISOString())}${scheduleTime ? ` · ${scheduleTime}` : ""}`
          : formatDisplayDate(scheduleDate.toISOString()),
        originalMeetingDate: attendanceLog?.meeting_date || "",
        originalRecordedAt: attendanceLog?.recorded_at || "",
        meetingDate: attendanceLog?.meeting_date || "",
        recordedAt: attendanceLog?.recorded_at || "",
        status: attendanceLog?.attendance_status || row.attendance_status || "Pending",
        remarks: attendanceLog?.remarks || row.remarks || "",
        isLocked: !!attendanceLog?.is_locked,
      };

      // A member qualifies for "Reschedule Training" if the secretary marked
      // them Absent or explicitly Rescheduled at the Training stage AND a
      // meeting_date was recorded (i.e. a real session was scheduled).
      const trainingStatusLower = String(attendanceLog?.attendance_status || "").toLowerCase();
      const wasAbsentAtTraining =
        (trainingStatusLower === "absent" || trainingStatusLower === "rescheduled") &&
        !!attendanceLog?.meeting_date;

      // A member belongs to the Reschedule Training tab as soon as they were
      // marked Absent at the Training stage (regardless of whether a new date
      // has actually been picked yet). Once in the Reschedule tab, they must
      // be hidden from the Training tab so the same person doesn't appear in
      // both places.
      const rescheduleLog = rescheduleLogMap.get(row.application_id);
      const belongsToReschedule = wasAbsentAtTraining;

      if (status && grouped[status]) {
        if (!(status === "Training" && belongsToReschedule)) {
          grouped[status].push(baseRow);
        }
      }

      if (wasAbsentAtTraining) {
        const rescheduleScheduleDate = rescheduleLog?.meeting_date
          ? new Date(rescheduleLog.meeting_date)
          : null;
        const rescheduleScheduleTime = rescheduleLog?.recorded_at
          ? formatDisplayTime(rescheduleLog.recorded_at)
          : "";

        grouped["Reschedule Training"].push({
          ...baseRow,
          // Present the rescheduled log as the primary schedule / status / remarks
          // so the shared Training-tab UI can update it directly. Keep the
          // original absent record accessible via `originalMeetingDate` for
          // context in the reschedule-date modal.
          schedule: rescheduleScheduleDate
            ? `${formatDisplayDate(rescheduleScheduleDate.toISOString())}${
                rescheduleScheduleTime ? ` · ${rescheduleScheduleTime}` : ""
              }`
            : "Not yet rescheduled",
          meetingDate: rescheduleLog?.meeting_date || "",
          recordedAt: rescheduleLog?.recorded_at || "",
          status: rescheduleLog?.attendance_status || "Pending",
          remarks: rescheduleLog?.remarks || "",
          hasReschedule: !!rescheduleLog,
          isLocked: !!rescheduleLog?.is_locked,
        });
      }
    }

    setTableData(grouped);
  };

  const persistAttendanceToApplication = async (member) => {
    const payload = {
      attendance_status: member.status,
      remarks: member.remarks ?? editedRemark,
    };

    const { error } = await supabase
      .from("member_applications")
      .update(payload)
      .eq("application_id", member.applicationId || member.id);

    if (error) {
      throw new Error(error.message || "Unable to save attendance in member_applications.");
    }
  };

  const upsertAttendanceLog = async (member, currentTab) => {
    const normalizedTab = String(currentTab || "").trim().toLowerCase();
    const resolvedMeetingDate = member.meetingDate || editedMeetingDate || "";
    const resolvedRecordedAt = buildRecordedAt(
      resolvedMeetingDate,
      member.meetingTime || editedMeetingTime,
      member.recordedAt ? new Date(member.recordedAt) : new Date()
    );

    let resolvedTrainingStage;
    if (normalizedTab === "training") {
      resolvedTrainingStage = "Training";
    } else if (normalizedTab === "reschedule training") {
      resolvedTrainingStage = "Rescheduled Training";
    } else {
      return {
        ok: true,
        skipped: true,
      };
    }

    const { data: authData } = await supabase.auth.getUser();

    // Lock semantics differ by stage:
    // - Training: Present / Absent / Rescheduled all lock immediately.
    // - Rescheduled Training: never locks via normal status change; the
    //   secretary must explicitly click "Lock In Attendance".
    const isDecidedStatus =
      member.status === "Present" ||
      member.status === "Absent" ||
      member.status === "Rescheduled";
    const nextIsLocked =
      resolvedTrainingStage === "Training" ? isDecidedStatus : false;

    const payload = {
      application_id: member.applicationId || member.id,
      member_name: member.name,
      member_email: member.email,
      training_stage: resolvedTrainingStage,
      attendance_status: member.status,
      remarks: member.remarks ?? editedRemark,
      meeting_date: resolvedMeetingDate || null,
      recorded_at: resolvedRecordedAt,
      recorded_by: authData?.user?.id || null,
      is_locked: nextIsLocked,
    };

    const tableCandidates = ["attendance_logs"];
    for (const tableName of tableCandidates) {
      const upsertTry = await supabase.from(tableName).upsert(payload, { onConflict: "application_id,training_stage" });
      if (!upsertTry.error) return { ok: true };

      const insertTry = await supabase.from(tableName).insert(payload);
      if (!insertTry.error) return { ok: true };
    }

    return {
      ok: false,
      warning: "Saved to member_applications, but attendance_logs insert failed. Run src/server/attendance_logs_schema.sql in Supabase.",
    };
  };

  useEffect(() => {
    const init = async () => {
      const role = await resolvePortalRole();
      setPortalRole(role);
      await fetchAttendanceRows();
    };
    init();
  }, []);

  // naku ervine
  

  const tabs = [
    { name: "Pending", count: tableData["Pending"].length, color: "bg-green-600" },
    { name: "Training", count: tableData["Training"].length, color: "bg-blue-500" },
    { name: "For Revision", count: tableData["For Revision"].length, color: "bg-amber-500" },
    { name: "Reschedule Training", count: tableData["Reschedule Training"].length, color: "bg-orange-500" },
  ];
  const isSecretary = portalRole === "secretary";
  const visibleTabs = isSecretary
    ? ["Pending", "Training", "For Revision", "Reschedule Training"]
    : tabs.map((tab) => tab.name);

  // Secretary is locked to Training + Reschedule Training tabs.
  useEffect(() => {
    if (isSecretary && !["Training", "Reschedule Training"].includes(activeTab)) {
      setActiveTab("Training");
    }
  }, [isSecretary, activeTab]);

  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  // --- MODAL HANDLERS ---
  const openModal = (member) => {
    setSelectedMember(member);
    setEditedRemark(member.remarks);
    setEditedMeetingDate(member.meetingDate || formatDateInputValue(member.recordedAt));
    setEditedMeetingTime(formatTimeInputValue(member.recordedAt));
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedMember(null);
    setEditedRemark("");
    setEditedMeetingDate("");
    setEditedMeetingTime("");
  };

  const saveRemark = async () => {
    if (!selectedMember) return;
    setSavingAttendance(true);
    // Update the remark in our state
    setTableData(prev => ({
      ...prev,
      [activeTab]: prev[activeTab].map(member => 
        member.id === selectedMember.id ? { ...member, remarks: editedRemark } : member
      )
    }));

    try {
      const updatedMember = { ...selectedMember, remarks: editedRemark };
      await persistAttendanceToApplication(updatedMember);
      const logResult = await upsertAttendanceLog(updatedMember, activeTab);
      if (!logResult.ok) {
        addNotification(logResult.warning, "warning");
      } else {
        addNotification("Attendance saved successfully", "success");
      }
      closeModal();
    } catch (err) {
      addNotification(err.message || "Unable to save attendance log.", "error");
    } finally {
      setSavingAttendance(false);
    }
  };

  const openRescheduleModal = (member) => {
    setRescheduleMember(member);
    setRescheduleDate(member.meetingDate || "");
    setRescheduleTime(formatTimeInputValue(member.recordedAt) || "");
    setRescheduleNote(member.hasReschedule ? "" : "");
    setIsRescheduleModalOpen(true);
  };

  const closeRescheduleModal = () => {
    setIsRescheduleModalOpen(false);
    setIsRescheduleConfirmOpen(false);
    setRescheduleMember(null);
    setRescheduleDate("");
    setRescheduleTime("");
    setRescheduleNote("");
  };

  const sendRescheduleEmail = async (member, newDateIso, note) => {
    if (!member?.email || member.email === "-") return;
    const formattedNew = `${formatDisplayDate(newDateIso)}${
      rescheduleTime ? ` at ${formatDisplayTime(newDateIso)}` : ""
    }`;
    const remarksText = [
      `Your original training on ${formatDisplayDate(member.originalMeetingDate || member.recordedAt)} was recorded as Absent.`,
      `Your rescheduled training is now set for ${formattedNew}.`,
      note ? `Note from Secretary: ${note}` : "",
    ].filter(Boolean).join("\n\n");

    try {
      await fetch(`${apiBaseUrl}/api/send-status-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          to_email: member.email,
          member_name: member.name,
          status: "Training Rescheduled",
          remarks: remarksText,
        }),
      });
    } catch (err) {
      console.warn("Reschedule email failed:", err);
    }
  };

  const saveReschedule = async () => {
    if (!rescheduleMember) return;
    if (!rescheduleDate) {
      addNotification("Please pick a new training date.", "error");
      return;
    }

    setSavingReschedule(true);
    try {
      const recordedAt = buildRecordedAt(rescheduleDate, rescheduleTime, new Date());

      const { data: authData } = await supabase.auth.getUser();
      const payload = {
        application_id: rescheduleMember.applicationId || rescheduleMember.id,
        member_name: rescheduleMember.name,
        member_email: rescheduleMember.email,
        training_stage: "Rescheduled Training",
        attendance_status: "Pending",
        remarks: rescheduleNote || null,
        meeting_date: rescheduleDate,
        recorded_at: recordedAt,
        recorded_by: authData?.user?.id || null,
      };

      const upsertTry = await supabase
        .from("attendance_logs")
        .upsert(payload, { onConflict: "application_id,training_stage" });

      if (upsertTry.error) {
        const insertTry = await supabase.from("attendance_logs").insert(payload);
        if (insertTry.error) throw new Error(insertTry.error.message);
      }

      await sendRescheduleEmail(rescheduleMember, recordedAt, rescheduleNote);
      addNotification("Training rescheduled and member notified.", "success");
      await fetchAttendanceRows();
      closeRescheduleModal();
    } catch (err) {
      addNotification(err.message || "Unable to reschedule training.", "error");
    } finally {
      setSavingReschedule(false);
    }
  };

  const handleAttendanceStatusChange = async (member, nextStatus) => {
    // Reschedule tab: no upfront confirmation — the secretary can change the
    // status freely until they explicitly lock it in via "Lock In Attendance".
    if (activeTab === "Reschedule Training") {
      await saveAttendanceStatusChange(member, nextStatus);
      return;
    }

    // Training tab: Present / Absent / Rescheduled all lock immediately, so
    // confirm before committing.
    if (nextStatus === "Present" || nextStatus === "Absent" || nextStatus === "Rescheduled") {
      setPendingAttendanceChange({ member, nextStatus });
      setIsConfirmationModalOpen(true);
      return;
    }

    await saveAttendanceStatusChange(member, nextStatus);
  };

  const requestLockIn = (member) => {
    setLockConfirm({ member });
  };

  const cancelLockIn = () => setLockConfirm(null);

  const confirmLockIn = async () => {
    if (!lockConfirm?.member) return;
    const member = lockConfirm.member;
    setSavingAttendance(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const recordedAt = member.recordedAt || buildRecordedAt(member.meetingDate || "", "", new Date());
      const payload = {
        application_id: member.applicationId || member.id,
        member_name: member.name,
        member_email: member.email,
        training_stage: "Rescheduled Training",
        attendance_status: member.status,
        remarks: member.remarks || null,
        meeting_date: member.meetingDate || null,
        recorded_at: recordedAt,
        recorded_by: authData?.user?.id || null,
        is_locked: true,
      };
      const upsertTry = await supabase
        .from("attendance_logs")
        .upsert(payload, { onConflict: "application_id,training_stage" });
      if (upsertTry.error) throw new Error(upsertTry.error.message);

      addNotification("Attendance locked in.", "success");
      setLockConfirm(null);
      await fetchAttendanceRows();
    } catch (err) {
      addNotification(err.message || "Unable to lock attendance.", "error");
    } finally {
      setSavingAttendance(false);
    }
  };

  const confirmAttendanceChange = async () => {
    if (!pendingAttendanceChange) return;
    const { member, nextStatus } = pendingAttendanceChange;
    setIsConfirmationModalOpen(false);
    await saveAttendanceStatusChange(member, nextStatus);
    setPendingAttendanceChange(null);
  };

  const cancelAttendanceChange = () => {
    setIsConfirmationModalOpen(false);
    setPendingAttendanceChange(null);
  };

  const saveAttendanceStatusChange = async (member, nextStatus) => {
    setSavingAttendance(true);
    const updatedMember = { ...member, status: nextStatus };

    setTableData((prev) => ({
      ...prev,
      [activeTab]: prev[activeTab].map((row) =>
        row.id === member.id ? { ...row, status: nextStatus } : row
      ),
    }));

    try {
      await persistAttendanceToApplication(updatedMember);
      const logResult = await upsertAttendanceLog(updatedMember, activeTab);
      if (!logResult.ok) {
        addNotification(logResult.warning, "warning");
      } else {
        addNotification("Status updated successfully", "success");
      }
    } catch (err) {
      addNotification(err.message || "Unable to save attendance status.", "error");
    } finally {
      setSavingAttendance(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src={logo} alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
              Secretary Portal
            </p>
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {(() => {
            const routeMap = {
    "Dashboard": "/BOD-dashboard",
    "Member Approvals": "/member-approvals",
    "Loan Approvals": "/bod-loan-approvals",
    "Loan Ledger": "/bod-manage-loans",
    "Manage Member": "/bod-manage-member",
    "Loan Policies": "/bod-loan-policies",
    "Training Attendance": "/Secretary_Attendance",
    "General Assembly": "/Secretary_General_Assembly",
    "Membership Records": "/Secretary_Records",
  };
  

            return menuItems.map((sectionGroup) => {
              const sectionRole = sectionGroup.section.toLowerCase();
              const isAccessible = !portalRole || sectionRole === portalRole;
              return (
              <div key={sectionGroup.section} className="mb-4 flex flex-col gap-2">
                <p className="text-xs font-bold text-gray-400 px-2 uppercase tracking-wider">
                  {sectionGroup.section}
                </p>
                {sectionGroup.items.map((item) => {
                  const Icon = item.icon;
                  const to = routeMap[item.name] || `/${item.name.toLowerCase().replace(/\s+/g, '-')}`;
                  if (!isAccessible) {
                    return (
                      <div
                        key={item.name}
                        title={`Only ${sectionGroup.section} accounts can access this`}
                        className="flex items-center gap-3 p-2 rounded-md text-gray-400 cursor-not-allowed select-none opacity-60"
                      >
                        <Icon size={20} /><span>{item.name}</span>
                      </div>
                    );
                  }
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
                })}
              </div>
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 z-10">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"/>
            <input type="text" className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-300 px-4 py-1 focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <NotificationBell />
          <img src="/img/bookkeeper-profile.png" alt="Bookkeeper Profile" className="ml-4 w-8 h-8 rounded-full" />
          <PortalTopbarIdentity className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold" fallbackPortal="Secretary Portal" fallbackRole="Secretary" />
        </header>

        <main className="p-8 overflow-auto">
          {/* Top Stats Cards — reflect the Secretary's active workload on this
              page: recording attendance, handling reschedules, and locking in
              verified rescheduled sessions. */}
          {(() => {
            const trainingRows = tableData["Training"] || [];
            const rescheduleRows = tableData["Reschedule Training"] || [];
            const isStatus = (s, target) => String(s || "").toLowerCase() === target;

            // "Attendance Recorded" — Training rows already decided as
            // Present/Absent (the secretary's completed work for the current
            // session).
            const attendanceRecorded = trainingRows.filter(
              (r) => isStatus(r.status, "present") || isStatus(r.status, "absent")
            ).length;

            // "Awaiting Attendance" — Training rows still Pending (secretary
            // hasn't recorded them yet).
            const awaitingAttendance = trainingRows.filter((r) => isStatus(r.status, "pending")).length;

            // "To Reschedule" — Absent members who don't have a new date yet
            // (action needed from the secretary).
            const toReschedule = rescheduleRows.filter((r) => !r.hasReschedule).length;

            // "Rescheduled Sessions" — new dates already set (work done).
            const rescheduledSessions = rescheduleRows.filter((r) => r.hasReschedule).length;

            const cards = [
              { label: "ATTENDANCE RECORDED", value: attendanceRecorded, Icon: BadgeCheck, iconBg: "#EAF5EC", iconColor: "#2C7A3F" },
              { label: "AWAITING ATTENDANCE", value: awaitingAttendance, Icon: ClipboardList, iconBg: "#FFF4E5", iconColor: "#D97706" },
              { label: "TO RESCHEDULE", value: toReschedule, Icon: AlertTriangle, iconBg: "#FEE2E2", iconColor: "#B91C1C" },
              { label: "RESCHEDULED SESSIONS", value: rescheduledSessions, Icon: CalendarDays, iconBg: "#FFF4E5", iconColor: "#D97706" },
            ];

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {cards.map(({ label, value, Icon, iconBg, iconColor }) => (
                  <div key={label} className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 shadow-sm">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: iconBg }}>
                      <Icon className="w-6 h-6" style={{ color: iconColor }} />
                    </div>
                    <div className="flex flex-col">
                      <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</h3>
                      <p className="text-2xl font-extrabold text-slate-800 mt-0.5">{value}</p>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Table Container */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            {/* Tabs */}
            <div className="flex gap-8 px-6 pt-4 border-b border-gray-200">
              {tabs.filter((tab) => visibleTabs.includes(tab.name)).map((tab) => {
                const isTabDisabled = isSecretary && !["Training", "Reschedule Training"].includes(tab.name);
                return (
                  <button
                    key={tab.name}
                    onClick={() => !isTabDisabled && setActiveTab(tab.name)}
                    disabled={isTabDisabled}
                    title={isTabDisabled ? "Only Training and Reschedule Training are accessible to Secretary accounts" : undefined}
                    className={`flex items-center gap-2 pb-4 px-1 text-sm font-semibold transition-colors relative ${
                      isTabDisabled
                        ? "text-gray-300 cursor-not-allowed"
                        : activeTab === tab.name
                        ? "text-green-600 border-b-2 border-green-600"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {tab.name}
                    <span className={`px-2 py-0.5 rounded-full text-xs text-white ${isTabDisabled ? "bg-gray-300" : tab.color}`}>
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Table Header */}
            <div className="p-6 flex justify-between items-center">
              <h2 className="text-xl font-bold text-[#2A2B4A]">
                {activeTab} Attendance & Evaluation
              </h2>
              <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                <Download size={16} />
                Export List
              </button>
            </div>

            {/* Table Body — shared UI for Training and Reschedule Training */}
            <div className="overflow-x-auto pb-4">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold">Member Name</th>
                    <th className="p-5 font-bold">
                      {activeTab === "Reschedule Training" ? "New Training Schedule" : "Training Schedule"}
                    </th>
                    <th className="p-5 font-bold">Attendance Status</th>
                    <th className="p-5 font-bold">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {tableData[activeTab]?.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                      <td className="p-5">
                        <p className="font-bold text-[#2A2B4A] text-sm">{row.name}</p>
                        <p className="text-xs text-gray-500">{row.email}</p>
                      </td>
                      <td className="p-5 text-sm text-gray-600 font-medium">
                        {activeTab === "Reschedule Training" ? (
                          <button
                            onClick={() => openRescheduleModal(row)}
                            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
                              row.hasReschedule
                                ? "border-[#66B538] bg-[#EAF6DF] text-[#1B5E20] hover:bg-[#D8EEC8]"
                                : "border-[#66B538] bg-[#66B538] text-white hover:bg-[#2C7A3F]"
                            }`}
                            title="Click to set or update the rescheduled training date"
                          >
                            <CalendarDays size={14} />
                            {row.schedule}
                          </button>
                        ) : (
                          row.schedule
                        )}
                      </td>
                      <td className="p-5">
                        {/* Lock rules per tab:
                            - Training: locked whenever attendance is Present/Absent
                              (isLocked from DB, but keep status-based fallback
                              so pre-migration rows still lock as expected).
                            - Reschedule Training: only locked once secretary
                              explicitly clicks "Lock In Attendance".
                        */}
                        {(() => {
                          const isReschedule = activeTab === "Reschedule Training";
                          const decided = row.status === "Present" || row.status === "Absent" || row.status === "Rescheduled";
                          // Lock rules:
                          // - Training tab: any decided status (Present /
                          //   Absent / Rescheduled) locks immediately.
                          // - Reschedule tab: rows are unlocked again so the
                          //   secretary can record attendance for the new
                          //   session; locking is re-established via the
                          //   explicit "Lock In Attendance" button.
                          const locked = isReschedule
                            ? row.isLocked
                            : row.isLocked || decided;
                          return (
                            <>
                              <select
                                className={`text-sm font-bold bg-transparent border border-gray-200 rounded-md py-1.5 px-3 pr-8 appearance-none focus:outline-none focus:ring-2 focus:ring-green-500 cursor-pointer transition-all
                                  ${row.status === 'Present' ? 'text-green-600' :
                                    row.status === 'Absent' ? 'text-red-600' :
                                    row.status === 'Rescheduled' ? 'text-orange-600' :
                                    'text-yellow-600'}
                                  ${locked ? 'cursor-not-allowed opacity-75' : ''}
                                `}
                                value={row.status}
                                disabled={locked}
                                onChange={(e) => handleAttendanceStatusChange(row, e.target.value)}
                                title={locked ? 'This attendance is locked and cannot be changed' : ''}
                                style={{
                                  backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%239CA3AF%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
                                  backgroundRepeat: "no-repeat",
                                  backgroundPosition: "right 0.7rem top 50%",
                                  backgroundSize: "0.65rem auto"
                                }}
                              >
                                <option value="Present" className="text-green-600">Present</option>
                                <option value="Absent" className="text-red-600">Absent</option>
                                <option value="Pending" className="text-yellow-600">Pending</option>
                                <option value="Rescheduled" className="text-orange-600">Rescheduled</option>
                              </select>
                              {locked && (
                                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                  <span className="inline-block w-1 h-1 bg-gray-400 rounded-full"></span>
                                  Status locked
                                </p>
                              )}
                              {isReschedule && !locked && decided && row.hasReschedule && (
                                <button
                                  onClick={() => requestLockIn(row)}
                                  className="mt-2 inline-flex items-center gap-1 rounded-md bg-orange-600 px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:bg-orange-700"
                                >
                                  Lock In Attendance
                                </button>
                              )}
                            </>
                          );
                        })()}
                      </td>
                      <td className="p-5">
                        <button
                          onClick={() => openModal(row)}
                          className="w-full text-left text-sm font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-md py-2 px-3 hover:bg-gray-100 transition-colors truncate"
                        >
                          {row.remarks || "Add evaluation remarks..."}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(!tableData[activeTab] || tableData[activeTab].length === 0) && (
                    <tr>
                      <td colSpan="4" className="py-8 text-center text-gray-500 font-medium">
                        {activeTab === "Reschedule Training"
                          ? "No absent members require rescheduling."
                          : "No records found for this category."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {/* --- MODAL OVERLAY --- */}
      {/* Confirmation Modal for Present/Absent Status */}
      <ConfirmDialog
        open={isConfirmationModalOpen && !!pendingAttendanceChange}
        title="Confirm Attendance Status"
        confirmLabel={pendingAttendanceChange ? `Mark as ${pendingAttendanceChange.nextStatus}` : 'Confirm'}
        loadingLabel="Confirming..."
        tone={pendingAttendanceChange?.nextStatus === 'Absent' ? 'destructive' : 'default'}
        loading={savingAttendance}
        onCancel={cancelAttendanceChange}
        onConfirm={confirmAttendanceChange}
      >
        {pendingAttendanceChange && (
          <>
            <div className="mb-6 rounded-xl border border-amber-100 bg-amber-50/70 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-white p-2 text-amber-600 shadow-sm flex-shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-amber-900 mb-1">Important Notice</p>
                  <p className="text-xs text-amber-800">
                    Once you confirm, their attendance status will be <strong>locked</strong> and cannot be changed in the future.
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Member</p>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="font-bold text-gray-900">{pendingAttendanceChange.member.name}</p>
                <p className="text-sm text-gray-600 mt-1">{pendingAttendanceChange.member.email}</p>
              </div>
            </div>

            <p className="text-sm text-gray-700">
              Are you sure you want to mark this member as <strong className={
                pendingAttendanceChange.nextStatus === 'Present' ? 'text-green-700' :
                pendingAttendanceChange.nextStatus === 'Rescheduled' ? 'text-orange-700' :
                'text-red-700'
              }>{pendingAttendanceChange.nextStatus}</strong>?
            </p>
          </>
        )}
      </ConfirmDialog>

      {/* --- TRAINING EVALUATION MODAL --- */}
      {isModalOpen && selectedMember && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-[500px] overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="bg-[#65B741] p-4">
              <h2 className="text-white font-bold text-lg">Training Evaluation Details</h2>
            </div>
            
            {/* Modal Body */}
            <div className="p-6">
              <div className="mb-6 rounded-xl border border-green-100 bg-green-50/70 p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-white p-2 text-[#1B5E20] shadow-sm">
                    <CalendarDays size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-green-700">Training Session</p>
                    <p className="mt-1 text-sm text-green-900">
                      Record the secretary's evaluation remarks for this training attendance. To change the schedule for absent members, use the Reschedule Training tab.
                    </p>
                  </div>
                </div>
              </div>

              {/* Info Row */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 mb-6">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 min-w-0">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Member Name</p>
                  <p className="font-bold text-gray-800 font-sm break-words">{selectedMember.name}</p>
                  <p className="text-sm text-gray-500 mt-1 break-all">{selectedMember.email}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Current Schedule</p>
                  <p className="font-bold text-gray-800 text-base">{selectedMember.schedule}</p>
                </div>
              </div>

              {/* Status Row */}
              <div className="mb-6">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Attendance Status</p>
                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold
                  ${selectedMember.status === 'Present' ? 'bg-green-100 text-green-700' :
                    selectedMember.status === 'Absent' ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-700'}
                `}>
                  <div className={`w-1.5 h-1.5 rounded-full
                    ${selectedMember.status === 'Present' ? 'bg-green-500' :
                      selectedMember.status === 'Absent' ? 'bg-red-500' :
                      'bg-yellow-500'}
                  `}></div>
                  {selectedMember.status}
                  {(selectedMember.status === 'Present' || selectedMember.status === 'Absent') && (
                    <span className="ml-1.5 text-xs font-semibold"></span>
                  )}
                </div>
              </div>

              {/* Editable Remarks */}
              <div className="mb-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Secretary Remarks</p>
                <textarea
                  className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#65B741] min-h-[100px] resize-none"
                  placeholder="Enter evaluation remarks..."
                  value={editedRemark}
                  onChange={(e) => setEditedRemark(e.target.value)}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <button 
                  onClick={closeModal} 
                  className="px-6 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
                <button 
                  onClick={saveRemark} 
                  disabled={savingAttendance}
                  className="px-6 py-2 bg-[#1B5E20] hover:bg-green-800 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  {savingAttendance ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- LOCK-IN CONFIRMATION MODAL (Reschedule Training) --- */}
      {lockConfirm?.member && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-[460px] overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-orange-600 p-4">
              <h2 className="text-white font-bold text-lg">Lock In Rescheduled Attendance</h2>
            </div>
            <div className="p-6">
              <div className="mb-5 rounded-xl border border-amber-100 bg-amber-50/70 p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-white p-2 text-amber-600 shadow-sm flex-shrink-0">
                    <AlertTriangle size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-amber-900 mb-1">This action is final</p>
                    <p className="text-xs text-amber-800">
                      Once locked, this rescheduled attendance can no longer be changed. Only proceed if you have verified the status.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mb-5">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Member</p>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <p className="font-bold text-gray-900">{lockConfirm.member.name}</p>
                  <p className="text-sm text-gray-600 mt-1 break-all">{lockConfirm.member.email}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    Rescheduled to <strong>{lockConfirm.member.schedule}</strong>
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Marking as{" "}
                    <strong className={lockConfirm.member.status === "Present" ? "text-green-700" : "text-red-700"}>
                      {lockConfirm.member.status}
                    </strong>
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  onClick={cancelLockIn}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmLockIn}
                  disabled={savingAttendance}
                  className="px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  {savingAttendance ? "Locking..." : "Lock In"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- RESCHEDULE TRAINING MODAL --- */}
      {isRescheduleModalOpen && rescheduleMember && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-[520px] overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-[#66B538] p-4">
              <h2 className="text-white font-bold text-lg">Reschedule Training</h2>
              <p className="text-[#EAF6DF] text-xs mt-1">Set a new training date for a member marked absent.</p>
            </div>

            <div className="p-6">
              <div className="mb-5 rounded-xl border border-green-100 bg-green-50/70 p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-white p-2 text-[#2C7A3F] shadow-sm">
                    <AlertTriangle size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#1B5E20] mb-1">Missed Training</p>
                    <p className="text-xs text-green-900">
                      This member was recorded absent on <strong>{formatDisplayDate(rescheduleMember.originalMeetingDate || rescheduleMember.originalRecordedAt)}</strong>. Setting a new date will notify them by email.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mb-5">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Member</p>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <p className="font-bold text-gray-900">{rescheduleMember.name}</p>
                  <p className="text-sm text-gray-600 mt-1 break-all">{rescheduleMember.email}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                <div>
                  <label className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    <CalendarDays size={14} />
                    New Training Date
                  </label>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#66B538]"
                    value={rescheduleDate}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                    min={formatDateInputValue(new Date())}
                  />
                </div>
                <div>
                  <label className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    <Clock3 size={14} />
                    New Training Time
                  </label>
                  <input
                    type="time"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#66B538]"
                    value={rescheduleTime}
                    onChange={(e) => setRescheduleTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="mb-5">
                <label className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  Note to Member (optional)
                </label>
                <textarea
                  className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#66B538] min-h-[80px] resize-none"
                  placeholder="e.g. Please arrive 15 minutes early. Bring a valid ID."
                  value={rescheduleNote}
                  onChange={(e) => setRescheduleNote(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  onClick={closeRescheduleModal}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setIsRescheduleConfirmOpen(true)}
                  disabled={savingReschedule || !rescheduleDate}
                  className="px-6 py-2 bg-[#66B538] hover:bg-[#2C7A3F] text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  {savingReschedule ? "Saving..." : "Save & Notify Member"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- FINAL CONFIRMATION: send reschedule email --- */}
      {isRescheduleConfirmOpen && rescheduleMember && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg shadow-xl w-[460px] overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-[#66B538] p-4">
              <h2 className="text-white font-bold text-lg">Confirm Reschedule Notification</h2>
              <p className="text-[#EAF6DF] text-xs mt-1">Review before sending the email to the member.</p>
            </div>
            <div className="p-6">
              <div className="mb-5 rounded-xl border border-green-100 bg-green-50/70 p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-white p-2 text-[#2C7A3F] shadow-sm flex-shrink-0">
                    <AlertTriangle size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#1B5E20] mb-1">This will send an email</p>
                    <p className="text-xs text-green-900">
                      A branded reschedule notification will be sent to the member's email. Make sure the details are correct.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mb-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Member</p>
                <p className="font-bold text-gray-900">{rescheduleMember.name}</p>
                <p className="text-sm text-gray-600 mt-1 break-all">{rescheduleMember.email}</p>
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">New Training Schedule</p>
                  <p className="text-sm font-semibold text-[#1B5E20]">
                    {formatDisplayDate(rescheduleDate)}
                    {rescheduleTime ? ` · ${rescheduleTime}` : ""}
                  </p>
                </div>
                {rescheduleNote && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Note to Member</p>
                    <p className="text-xs text-gray-700 whitespace-pre-wrap">{rescheduleNote}</p>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  onClick={() => setIsRescheduleConfirmOpen(false)}
                  disabled={savingReschedule}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
                >
                  Back
                </button>
                <button
                  onClick={async () => {
                    await saveReschedule();
                    setIsRescheduleConfirmOpen(false);
                  }}
                  disabled={savingReschedule}
                  className="px-6 py-2 bg-[#66B538] hover:bg-[#2C7A3F] text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  {savingReschedule ? "Sending..." : "Confirm & Send Email"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Secretary_Attendance;



