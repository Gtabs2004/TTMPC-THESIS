import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { History, ArrowRight } from "lucide-react";
import {
  ACTION_STYLES,
  ENTITY_LABELS,
  formatAuditTimestamp,
  describeAuditContext,
} from "./AuditLogViewer";

/**
 * Compact "Recent Activity" widget for portal dashboards.
 * RLS scopes the query automatically (BOD sees everything, staff see only their own).
 *
 * Props:
 *   to    — URL to navigate to when the card / "View all" is clicked.
 *   limit — number of rows (default 5).
 *   title — heading (default "Recent Activity").
 */
const RecentActivityCard = ({ to, limit = 5, title = "Recent Activity" }) => {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("audit_log")
          .select("id, occurred_at, actor_email, actor_role, entity_type, entity_id, action, context, before, after")
          .order("occurred_at", { ascending: false })
          .limit(limit);
        if (!cancelled) {
          if (error) {
            setRows([]);
          } else {
            setRows(data || []);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [limit]);

  const handleNav = () => {
    if (to) navigate(to);
  };

  return (
    <div
      className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer hover:border-green-300 hover:shadow-md transition-all"
      onClick={handleNav}
    >
      <div className="p-5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-green-50 rounded-md text-[#2C7A3F]">
            <History className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        </div>
        <span className="flex items-center gap-1 text-xs text-[#1D6021] font-bold hover:underline">
          View all <ArrowRight className="w-3 h-3" />
        </span>
      </div>

      <ul className="divide-y divide-gray-50">
        {loading ? (
          <li className="p-4 text-center text-xs text-gray-400">Loading…</li>
        ) : rows.length === 0 ? (
          <li className="p-4 text-center text-xs text-gray-400">No recent activity.</li>
        ) : rows.map((r) => {
          const actionClass = ACTION_STYLES[r.action] || "bg-gray-100 text-gray-600";
          return (
            <li key={r.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50">
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase ${actionClass} shrink-0`}>
                {r.action}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-700 truncate">
                  {ENTITY_LABELS[r.entity_type] || r.entity_type} · <span className="font-mono">{describeAuditContext(r)}</span>
                </p>
                <p className="text-[10px] text-gray-400">{formatAuditTimestamp(r.occurred_at)}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default RecentActivityCard;
