/**
 * Header — Top bar shown on every authenticated page.
 * Yifu Hou -23009975
 * Displays the app name on the left and a user dropdown on the right.
 * The dropdown shows the user's email and a "Sign Out" button that
 * clears local tokens and redirects to the Cognito /logout endpoint.
 *
 * Uses a simple click-outside-to-close pattern via a fixed overlay div.
 */

import React from 'react';

export default function Header({ user, onLogout }) {
  const [showMenu, setShowMenu] = React.useState(false);

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm">
      {/* Left: logo + app name */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <h1 className="text-lg font-bold text-gray-800">Smart Dorm Energy Monitor</h1>
      </div>

      {/* Right: user avatar + dropdown */}
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          {/* Avatar circle — first letter of email */}
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
            <span className="text-sm font-semibold text-blue-600">
              {(user?.email || 'U')[0].toUpperCase()}
            </span>
          </div>
          {/* Email — hidden on small screens to save space */}
          <span className="text-sm text-gray-600 hidden sm:block">{user?.email || 'User'}</span>
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showMenu && (
          <>
            {/*
              Invisible overlay behind the dropdown — clicking anywhere
              outside the menu closes it. Using fixed positioning so it
              covers the entire viewport.
            */}
            <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-100 z-20 py-1">
              <div className="px-4 py-2 border-b border-gray-100">
                <p className="text-sm font-medium text-gray-800 truncate">{user?.email || 'User'}</p>
              </div>
              <button
                onClick={() => { setShowMenu(false); onLogout(); }}
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign Out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
