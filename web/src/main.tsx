import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// bootstrap-icons đã được import qua CDN trong index.html: <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
