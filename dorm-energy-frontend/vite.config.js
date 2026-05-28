/**
 * Vite configuration for the Smart Dorm Energy Monitor frontend.
 *
 * Uses @vitejs/plugin-react for JSX transform and Fast Refresh.
 * Dev server binds to 0.0.0.0 so the app is reachable from other
 * devices on the local network (useful for testing on a phone/tablet).
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',   // listen on all network interfaces
    port: 5173          // must match COGNITO.REDIRECT_URI in config.js
  }
});
