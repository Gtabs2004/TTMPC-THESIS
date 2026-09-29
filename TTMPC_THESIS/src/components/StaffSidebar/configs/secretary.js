import { CalendarCheck, CalendarDays, Archive } from "lucide-react";

// Secretary portal navigation. Same list on every standalone Secretary page.
export const secretaryNav = [
  { name: "Training Attendance",  icon: CalendarCheck, path: "/Secretary_Attendance" },
  { name: "General Assembly",     icon: CalendarDays,  path: "/Secretary_General_Assembly" },
  { name: "Membership Records",   icon: Archive,       path: "/Secretary_Records" },
];
