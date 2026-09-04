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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <>
     <ThemeProvider>
       <NotificationProvider>
         <ConfirmProvider>
           <AuthContextProvider>
             <DocumentTitleSync />
             <NotificationContainer />
             <PwaInstallGate />
             <StandaloneMemberOnlyGuard />
             <RouterProvider router={router} />
           </AuthContextProvider>
         </ConfirmProvider>
       </NotificationProvider>
     </ThemeProvider>
    </>
  </StrictMode>
)
