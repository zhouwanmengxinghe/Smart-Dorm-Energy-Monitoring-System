/**
 * Alerts — Overload alert history page.
 *
 * Fetches records from the DormAlertHistory DynamoDB table via GET /alerts.
 * Each alert includes the power reading, threshold at the time, voltage,
 * current, and timestamp.
 *
 * Displays:
 *   - A summary banner with the total count of historical overload events.
 *   - A data table with columns: Time, Power, Threshold, Excess, Current,
 *     Voltage, Type (always "Overload" for this table).
 *   - Empty state with a green checkmark when no overloads have occurred.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { fetchAlertHistory } from '../api';

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetchAlertHistory(50);
      setAlerts(res?.data || []);
      setError('');
    } catch (e) {
      setError(e.message || 'Failed to load alert records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Show a loading skeleton while the first fetch is in-flight
  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-gray-800">Alert History</h2>
        <div className="text-center py-20 text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title bar with manual refresh button */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Alert History</h2>
        <button
          onClick={load}
          className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {/* Empty state — shown when no overload events exist */}
      {alerts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 text-center py-20">
          <p className="text-4xl mb-3">{'✅'}</p>
          <p className="text-gray-500">No alert records</p>
          <p className="text-sm text-gray-400 mt-1">System operating normally, no overload events detected</p>
        </div>
      ) : (
        <>
          {/* Summary banner with total count */}
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-4">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <div>
              <p className="text-xl font-bold text-red-700">{alerts.length}</p>
              <p className="text-sm text-red-600">Historical overload alert records</p>
            </div>
          </div>

          {/* Alert data table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">Time</th>
                    <th className="text-right px-4 py-3 text-gray-500 font-medium">Power (W)</th>
                    <th className="text-right px-4 py-3 text-gray-500 font-medium">Threshold (W)</th>
                    <th className="text-right px-4 py-3 text-gray-500 font-medium">Excess</th>
                    <th className="text-right px-4 py-3 text-gray-500 font-medium">Current (A)</th>
                    <th className="text-right px-4 py-3 text-gray-500 font-medium">Voltage (V)</th>
                    <th className="text-center px-4 py-3 text-gray-500 font-medium">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {alerts.map((a, i) => {
                    // Calculate how much the power exceeded the threshold
                    const excess = (a?.power ?? 0) - (a?.threshold ?? 0);
                    return (
                      <tr key={a?.alertId || i} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap font-mono text-xs">{a?.timestamp || '--'}</td>
                        <td className="px-4 py-3 text-right text-red-600 font-bold">{a?.power ?? '--'}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{a?.threshold ?? '--'}</td>
                        {/* Excess shown with a + prefix so it reads naturally as "over by X W" */}
                        <td className="px-4 py-3 text-right text-red-500 font-medium">
                          {typeof excess === 'number' && a?.power != null ? `+${excess.toFixed(0)}` : '--'}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">{a?.current ?? '--'}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{a?.voltage ?? '--'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-100 px-2 py-0.5 rounded-full font-medium">
                            <span className="w-1.5 h-1.5 bg-red-500 rounded-full" /> Overload
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
