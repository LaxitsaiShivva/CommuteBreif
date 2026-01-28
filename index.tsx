
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error("DOM Error: Could not find root element. Check index.html for <div id='root'></div>");
} else {
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (error) {
    console.error("Application Crash during Boot:", error);
    rootElement.innerHTML = `
      <div style="padding: 40px; font-family: sans-serif; text-align: center;">
        <h2 style="color: #e11d48;">Initialization Failed</h2>
        <p style="color: #64748b;">The app failed to start. Please check the browser console for details.</p>
      </div>
    `;
  }
}
