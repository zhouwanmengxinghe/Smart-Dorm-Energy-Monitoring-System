/**
 * ErrorBoundary — React class component that catches render-phase errors.
 * Yifu Hou -23009975
 */

import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  // Update state so the next render shows the fallback UI
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  // Log the error for debugging (browser console or future reporting service)
  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              {/* Triangle-exclamation icon */}
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Page Error</h2>
            <p className="text-gray-500 mb-6 text-sm">
              {this.state.error?.message || 'An unknown error occurred'}
            </p>
            <button
              onClick={() => {
                // Reset error state and reload the page for a clean slate
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
