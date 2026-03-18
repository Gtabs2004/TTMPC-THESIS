import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft } from 'lucide-react';

const Record_Details = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  // Sample member data - you can replace this with actual API calls
  const memberData = {
    "TTMPCAP-001": {
      name: "Gero Antoni Tabiolo",
      membershipNumber: "2023-0001",
      dateOfMembership: "01/15/2023",
      bodResolutionNumber: "RES-2023-01-01",
      numberOfShares: "100",
      amount: "₱5000.00",
      initialPaidUpCapital: "₱2500.00",
      terminationResolutionNumber: "None",
      terminationDate: "mm/dd/yyyy"
    },
    "TTMPCAP-002": {
      name: "Erden Jhed Teope",
      membershipNumber: "2023-0002",
      dateOfMembership: "02/20/2023",
      bodResolutionNumber: "RES-2023-02-02",
      numberOfShares: "80",
      amount: "₱4000.00",
      initialPaidUpCapital: "₱2000.00",
      terminationResolutionNumber: "None",
      terminationDate: "mm/dd/yyyy"
    },
    "TTMPCAP-003": {
      name: "Ashley Nicole Bulotaolo",
      membershipNumber: "2023-0003",
      dateOfMembership: "03/10/2023",
      bodResolutionNumber: "RES-2023-03-03",
      numberOfShares: "120",
      amount: "₱6000.00",
      initialPaidUpCapital: "₱3000.00",
      terminationResolutionNumber: "None",
      terminationDate: "mm/dd/yyyy"
    },
    "TTMPCAP-004": {
      name: "Romelyn Delos Reyes",
      membershipNumber: "2023-0004",
      dateOfMembership: "04/05/2023",
      bodResolutionNumber: "RES-2023-04-04",
      numberOfShares: "100",
      amount: "₱5000.00",
      initialPaidUpCapital: "₱2500.00",
      terminationResolutionNumber: "None",
      terminationDate: "mm/dd/yyyy"
    },
    "TTMPCAP-005": {
      name: "Nash Ervine Siaton",
      membershipNumber: "2023-0005",
      dateOfMembership: "05/12/2023",
      bodResolutionNumber: "RES-2023-05-05",
      numberOfShares: "90",
      amount: "₱4500.00",
      initialPaidUpCapital: "₱2250.00",
      terminationResolutionNumber: "None",
      terminationDate: "mm/dd/yyyy"
    }
  };

  const currentMember = memberData[id] || memberData["TTMPCAP-001"];

  const [formData, setFormData] = useState({
    membershipNumber: currentMember.membershipNumber,
    dateOfMembership: currentMember.dateOfMembership,
    bodResolutionNumber: currentMember.bodResolutionNumber,
    numberOfShares: currentMember.numberOfShares,
    amount: currentMember.amount,
    initialPaidUpCapital: currentMember.initialPaidUpCapital,
    terminationResolutionNumber: currentMember.terminationResolutionNumber,
    terminationDate: currentMember.terminationDate
  });

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = () => {
    console.log("Saving record:", formData);
    // Add your save logic here
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
        <h1 className="text-3xl font-bold text-gray-800 mb-8">{currentMember.name}</h1>

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
            className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
          >
            Save
          </button>
        </div>
        </div>
      </div>
    </div>
  );
};

export default Record_Details;
