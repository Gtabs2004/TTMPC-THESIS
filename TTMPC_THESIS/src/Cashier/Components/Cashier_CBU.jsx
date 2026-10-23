import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRightCircle } from "lucide-react";
import CbuLedgerPage from "../../components/CbuLedgerPage";
import { cashierNav } from "../../components/StaffSidebar/configs/cashier";

// The page itself is shared with the Bookkeeper (components/CbuLedgerPage.jsx)
// so the two stay identical. The Cashier adds a Deposit button per member.
const Cashier_CBU = () => {
  const navigate = useNavigate();

  return (
    <CbuLedgerPage
      portal="Cashier"
      navItems={cashierNav}
      bellRole="cashier"
      subtitle="Each member's share capital in the cooperative. Use Deposit to record money a member has paid in."
      memberAction={{
        label: "Deposit",
        icon: ArrowRightCircle,
        onClick: (member) => {
          const memberRef = member?.member_uuid || member?.member_id;
          navigate(`/Cashier_CBU_Deposit/${encodeURIComponent(memberRef)}`);
        },
      }}
    />
  );
};

export default Cashier_CBU;
