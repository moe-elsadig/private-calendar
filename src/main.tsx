import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './index.css'
import { CalendarView } from './components/CalendarView'

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "placeholder_client_id";

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={clientId}>
      <CalendarView />
    </GoogleOAuthProvider>
  </StrictMode>,
)
