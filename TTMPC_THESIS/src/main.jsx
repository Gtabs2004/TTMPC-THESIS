import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

import { RouterProvider } from 'react-router-dom'
import { router } from './Router.jsx'
import { AuthContextProvider } from "./contex/AuthContext.jsx";
import { NotificationProvider } from "./contex/NotificationContext.jsx";
import NotificationContainer from "./components/NotificationContainer.jsx";
import DocumentTitleSync from "./components/DocumentTitleSync.jsx";
import PwaInstallGate from "./components/PwaInstallGate.jsx";
import StandaloneMemberOnlyGuard from "./components/StandaloneMemberOnlyGuard.jsx";
import { ConfirmProvider } from "./contex/ConfirmContext.jsx";
import { ThemeProvider } from "./contex/ThemeContext.jsx";
import { StaffLayoutProvider } from "./contex/StaffLayoutContext.jsx";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient.js";

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
     <ThemeProvider>
       <NotificationProvider>
         <ConfirmProvider>
           <AuthContextProvider>
             <DocumentTitleSync />
             <NotificationContainer />
             <PwaInstallGate />
             <StandaloneMemberOnlyGuard />
             <StaffLayoutProvider>
               <RouterProvider router={router} />
             </StaffLayoutProvider>
           </AuthContextProvider>
         </ConfirmProvider>
       </NotificationProvider>
     </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
)
