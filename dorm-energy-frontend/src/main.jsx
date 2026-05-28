/**
 * main.jsx — Application entry point.
 *
 * Mounts the <App /> component into the #root div.
 * React.StrictMode enables double-invocation of effects/reducers
 * in development to surface side-effect bugs early.
 *
 * index.css is imported here so Vite's PostCSS pipeline processes
 * the Tailwind directives and injects the generated utility classes.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
