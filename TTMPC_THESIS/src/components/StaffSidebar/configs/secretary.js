import { CalendarCheck, CalendarDays, Archive } from "lucide-react";

// Secretary portal navigation. Same list on every standalone Secretary page.
export const secretaryNav = [
  { name: "Training Attendance",  icon: CalendarCheck, path: "/Secretary_Attendance" },
  { name: "General Assembly",     icon: CalendarDays,  path: "/Secretary_General_Assembly" },
  { name: "Membership Records",   icon: Archive,       path: "/Secretary_Records" },
];

// Same list, grouped under a "SECRETARY" section header — for pages that show
// more than one role's menu at once (see BOD/Components/Secretary_Records.jsx).
export const secretarySections = [{ section: "SECRETARY", items: secretaryNav }];
