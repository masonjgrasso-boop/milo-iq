import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthProvider';
import { ToastProvider } from './context/ToastProvider';
import { SetupNotice } from './pages/SetupNotice';
import { isFirebaseConfigured } from './lib/firebase';
import './index.css';

// Without config there is nothing to connect to, so we skip the whole auth
// tree and explain what is missing instead.
const tree = isFirebaseConfigured ? (
  <BrowserRouter>
    <AuthProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </AuthProvider>
  </BrowserRouter>
) : (
  <SetupNotice />
);

createRoot(document.getElementById('root')!).render(<StrictMode>{tree}</StrictMode>);
