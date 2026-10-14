import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// bootstrap-icons đã được import qua CDN trong index.html
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
