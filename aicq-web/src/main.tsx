import React from 'react';
import ReactDOM from 'react-dom/client';
import { AICQProvider } from './context/AICQContext';
import App from './App';
import './App.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AICQProvider>
      <App />
    </AICQProvider>
  </React.StrictMode>,
);
