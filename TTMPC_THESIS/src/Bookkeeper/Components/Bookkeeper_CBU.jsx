import React from "react";
import CbuLedgerPage from "../../components/CbuLedgerPage";
import { bookkeeperNav } from "../../components/StaffSidebar/configs/bookkeeper";

// The page itself is shared with the Cashier (components/CbuLedgerPage.jsx) so
// the two stay identical; the Bookkeeper's view is read-only.
const Bookkeeper_CBU = () => (
  <CbuLedgerPage
    portal="Bookkeeper"
    navItems={bookkeeperNav}
    bellRole="bookkeeper"
    subtitle="Read-only ledger of member CBU/share balances and contributions"
  />
);

export default Bookkeeper_CBU;
