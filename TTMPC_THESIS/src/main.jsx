import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

import { RouterProvider } from 'react-router-dom'
import { router } from './Router.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <>
      <h1>TTMPC</h1>
      <h2>Login</h2>
      <router></router>
      <RouterProvider router={router} />
    </>
  </StrictMode>
)
