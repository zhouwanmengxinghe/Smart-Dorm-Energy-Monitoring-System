/**
 * App.jsx — Root component: authentication gate + page router.
 * Yifu Hou -23009975
 * 
 * Authentication model:
 *   1. On mount, check the URL for ?code= (Cognito callback).
 *      If present, exchange the code for tokens via Auth.exchangeCodeForTokens.
 *   2. If no code, check localStorage for an existing session via Auth.getCurrentSession.
 *   3. If neither yields a user, render <LandingPage /> with a "Sign In" button
 *      that links to the Cognito Hosted UI.
 *   4. Once authenticated, render the full dashboard layout with sidebar navigation.
 *
 * Page routing uses a simple state variable (no react-router) to avoid
 * dependency overhead and Vite dynamic-import fragility. All four business
 * pages are statically imported so they are guaranteed to resolve.
 */

import React, { useState, useEffect } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import Simulator from './components/Simulator';
import Alerts from './components/Alerts';
import Settings from './components/Settings';
import { getCurrentSession, exchangeCodeForTokens, signOut, getLogoutUrl } from './auth';

export default function App() {
  // auth.checked: false while we determine session state (avoids flash of wrong page)
  const [auth, setAuth] = useState({ checked: false, user: null });
  // Current active page in the dashboard sidebar
  const [page, setPage] = useState('dashboard');

  //  Auth initialisation 
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (code) {
      // Clean the URL immediately so the code isn't re-used on refresh
      window.history.replaceState({}, '', '/');

      exchangeCodeForTokens(code)
        .then((result) => setAuth({ checked: true, user: result.user }))
        .catch(() => setAuth({ checked: true, user: null }));
      return;
    }

    // No code param — check for an existing stored session
    getCurrentSession()
      .then((session) => setAuth({ checked: true, user: session.getIdToken().payload }))
      .catch(() => setAuth({ checked: true, user: null }));
  }, []);

  // Logout handler 
  // Clear local tokens, then redirect to Cognito /logout to also
  // clear the Cognito session cookie. Cognito redirects back to our
  // landing page, where the user will see the "Sign In" button again.
  const handleLogout = () => {
    signOut();
    window.location.href = getLogoutUrl();
  };

  //Loading state 
  if (!auth.checked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <svg className="animate-spin w-10 h-10 text-blue-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  //Unauthenticated → Landing Page 
  if (!auth.user) {
    return (
      <ErrorBoundary>
        <LandingPage />
      </ErrorBoundary>
    );
  }

  //  Authenticated → Dashboard layout
  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard />;
      case 'simulator': return <Simulator />;
      case 'alerts':    return <Alerts />;
      case 'settings':  return <Settings />;
      default:          return <Dashboard />;
    }
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Header user={auth.user} onLogout={handleLogout} />
        <div className="flex flex-1">
          {/* Desktop sidebar — hidden below md breakpoint */}
          <Sidebar activePage={page} onNavigate={setPage} />
          {/* Main content area — extra bottom padding on mobile for the tab bar */}
          <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 overflow-auto">
            <ErrorBoundary>
              {renderPage()}
            </ErrorBoundary>
          </main>
        </div>
        {/* Mobile bottom tab bar — visible only below md breakpoint */}
        <MobileNav activePage={page} onNavigate={setPage} />
      </div>
    </ErrorBoundary>
  );
}
