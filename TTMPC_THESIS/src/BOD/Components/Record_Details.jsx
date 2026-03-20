import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const Record_Details = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [memberName, setMemberName] = useState("Membership Record");
  const [saveMessage, setSaveMessage] = useState("");

  const [formData, setFormData] = useState({
    membershipNumber: "",
    dateOfMembership: "",
    bodResolutionNumber: "",
    numberOfShares: "",
    amount: "",
    initialPaidUpCapital: "",
    terminationResolutionNumber: "",
    terminationDate: ""
  });

  useEffect(() => {
    async function loadDetails() {
      if (!id) return;
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`${API_BASE_URL}/api/secretary/membership-records/${encodeURIComponent(id)}`, {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.detail || payload?.message || "Failed to load record details.");
        }

        const row = payload.data || {};
        setMemberName(row.name || "Membership Record");
        setFormData({
          membershipNumber: row.membership_number || "",
          dateOfMembership: row.date_of_membership ? String(row.date_of_membership).slice(0, 10) : "",
          bodResolutionNumber: row.bod_resolution_number || "",
          numberOfShares: row.number_of_shares ?? "",
          amount: row.amount ?? "",
          initialPaidUpCapital: row.initial_paid_up_capital ?? "",
          terminationResolutionNumber: row.termination_resolution_number || "",
          terminationDate: row.termination_date ? String(row.termination_date).slice(0, 10) : "",
        });
      } catch (err) {
        setError(err?.message || "Unable to load record details.");
      } finally {
        setLoading(false);
      }
    }

    loadDetails();
  }, [id]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/secretary/membership-records/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          membership_number: formData.membershipNumber,
          date_of_membership: formData.dateOfMembership || null,
          bod_resolution_number: formData.bodResolutionNumber,
          number_of_shares: formData.numberOfShares === "" ? null : Number(formData.numberOfShares),
          amount: formData.amount === "" ? null : Number(formData.amount),
          initial_paid_up_capital: formData.initialPaidUpCapital === "" ? null : Number(formData.initialPaidUpCapital),
          termination_resolution_number: formData.terminationResolutionNumber,
          termination_date: formData.terminationDate || null,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.detail || payload?.message || "Failed to save record.");
      }

      setSaveMessage("Membership record saved successfully.");
    } catch (err) {
      setSaveMessage(err?.message || "Failed to save record.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-4xl">
        <button 
          onClick={() => navigate('/Secretary_Records')}
          className="flex items-center gap-2 text-green-700 font-semibold hover:text-green-800 mb-6 transition-colors"
        >
          <ChevronLeft size={20} />
          Back to Membership Records
        </button>

        <div className="bg-white rounded-lg shadow-sm p-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">{memberName}</h1>

        {loading ? (
          <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">Loading record details...</div>
        ) : null}

        {error ? (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        {saveMessage ? (
          <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{saveMessage}</div>
        ) : null}

        {/* Section 1: Membership Information */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Section 1: Membership Information</h2>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">Membership Number</label>
              <input
                type="text"
                value={formData.membershipNumber}
                onChange={(e) => handleInputChange('membershipNumber', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">Date of Membership</label>
              <input
                type="text"
                value={formData.dateOfMembership}
                onChange={(e) => handleInputChange('dateOfMembership', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">BOD Resolution Number</label>
              <input
                type="text"
                value={formData.bodResolutionNumber}
                onChange={(e) => handleInputChange('bodResolutionNumber', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Initial Capital Subscription */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-700">Section 2: Initial Capital Subscription</h2>
            <span className="text-xs font-semibold text-gray-400 uppercase">Share Capital</span>
          </div>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">Number of Shares</label>
              <input
                type="text"
                value={formData.numberOfShares}
                onChange={(e) => handleInputChange('numberOfShares', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">Amount (₱)</label>
              <input
                type="text"
                value={formData.amount}
                onChange={(e) => handleInputChange('amount', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">Initial Paid-up Capital (₱)</label>
              <input
                type="text"
                value={formData.initialPaidUpCapital}
                onChange={(e) => handleInputChange('initialPaidUpCapital', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Termination of Membership */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-700">Section 3: Termination of Membership</h2>
            <span className="text-xs font-semibold text-gray-400 uppercase">Optional | Status Active</span>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">Termination BOD Resolution Number</label>
              <input
                type="text"
                value={formData.terminationResolutionNumber}
                onChange={(e) => handleInputChange('terminationResolutionNumber', e.target.value)}
                placeholder="None"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">Termination Date</label>
              <input
                type="text"
                value={formData.terminationDate}
                onChange={(e) => handleInputChange('terminationDate', e.target.value)}
                placeholder="mm/dd/yyyy"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
          <p className="text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 mt-4">
            * Filling out the termination fields will mark this membership record as inactive. Leave empty if the member is still active.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-4 mt-10 pt-6 border-t border-gray-200">
          <button
            onClick={() => navigate('/Secretary_Records')}
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
};

export default Record_Details;
