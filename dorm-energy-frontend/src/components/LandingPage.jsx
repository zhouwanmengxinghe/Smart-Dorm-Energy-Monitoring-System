/**
 * LandingPage — Shown when the user is not authenticated.
 *
 * Renders a branded welcome screen with a single "Sign In with AWS Cognito"
 * button that links to the Cognito Hosted UI /login endpoint.
 *
 * No form, no credential handling — all authentication is delegated to
 * Cognito's hosted pages (which also handle FORCE_CHANGE_PASSWORD natively).
 */

import React from 'react';
import { getLoginUrl } from '../auth';

export default function LandingPage() {
  return (
    // Full-screen gradient background matching the app's brand colours
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        {/* Lightning-bolt logo in a frosted-glass circle */}
        <div className="w-20 h-20 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>

        <h1 className="text-3xl font-bold text-white mb-2">Smart Dorm Energy Monitor</h1>
        <p className="text-blue-200 text-lg mb-10">Smart Dorm EnergyGuard</p>

        {/* This is a plain <a> link, not a button — it navigates to an external URL */}
        <a
          href={getLoginUrl()}
          className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-blue-700 rounded-xl font-semibold text-lg hover:bg-blue-50 transition-colors shadow-lg shadow-blue-900/30"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM9.5 16.5v-9l7 4.5-7 4.5z"/>
          </svg>
          Sign In with AWS Cognito
        </a>

        <p className="text-blue-200/70 text-xs mt-8">
          You will be redirected to the secure AWS Cognito login page.
        </p>
      </div>
    </div>
  );
}
