import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

import { RouterProvider } from 'react-router-dom'
import { router } from './Router.jsx'
import { AuthContextProvider } from "./contex/AuthContext.jsx";
import { NotificationProvider } from "./contex/NotificationContext.jsx";
import NotificationContainer from "./components/NotificationContainer.jsx";
import PwaInstallGate from "./components/PwaInstallGate.jsx";
import { ConfirmProvider } from "./contex/ConfirmContext.jsx";
import { ThemeProvider } from "./contex/ThemeContext.jsx";

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <>
     <ThemeProvider>
       <NotificationProvider>
         <ConfirmProvider>
           <AuthContextProvider>
             <NotificationContainer />
             <PwaInstallGate />
             <RouterProvider router={router} />
           </AuthContextProvider>
         </ConfirmProvider>
       </NotificationProvider>
     </ThemeProvider>
    </>
  </StrictMode>
)
