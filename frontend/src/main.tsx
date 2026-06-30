import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { Toaster } from 'sonner';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <Toaster 
      position="bottom-right" 
      theme="dark" 
      toastOptions={{
        style: {
          background: '#1e1a20',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          color: '#ffffff',
        },
      }}
      closeButton 
    />
  </React.StrictMode>
);
