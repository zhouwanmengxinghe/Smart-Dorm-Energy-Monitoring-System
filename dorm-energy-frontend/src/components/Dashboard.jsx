/**
 * Dashboard — Real-time energy monitoring overview.
 * Yifu Hou -23009975
 * Features:
 *   - Four stat cards showing latest Power / Current / Voltage / Total Energy.
 *   - Overload warning banner: red pulsing bar when is_overload is true.
 *   - Three Chart.js charts (single Y-axis each to avoid dual-axis crashes):
 *     • Power Trend line chart with threshold reference line
 *     • Current Distribution bar chart
 *     • Voltage Curve line chart
 *   - Recent records table with overload highlighting.
 *
 * Data is fetched via GET /data and auto-refreshed every 15 seconds.
 * All data access uses optional chaining (?.) and nullish coalescing (??)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { fetchElectricityData } from '../api';

// Register Chart.js components once at module scope
ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend, Filler
);

// Shared chart options — single Y-axis, responsive, clean grid
const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { intersect: false, mode: 'index' },
  plugins: {
    legend: { position: 'top', labels: { usePointStyle: true, padding: 20, boxWidth: 8 } }
  },
  scales: {
    x: { grid: { display: false }, ticks: { maxTicksLimit: 10, maxRotation: 45 } },
    y: { beginAtZero: false, grid: { color: '#f1f5f9' } }
  }
};

/**
 * Transform raw API items into reversed arrays for Chart.js.
 * Data comes from DynamoDB in descending time order — we reverse
 * so charts read left-to-right chronologically.
 */
function chartDataFrom(items) {
  // Convert UTC timestamp to NZ time for chart x-axis (HH:MM format)
  function nzTimeLabel(isoStr) {
    if (!isoStr) return '';
    try {
      return new Date(isoStr).toLocaleString('en-NZ', {
        timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit'
      });
    } catch { return isoStr.slice(11, 16); }
  }
  const labels = items.map((d) => nzTimeLabel(d?.timestamp)).reverse();

  const power  = items.map((d) => d?.power ?? 0).reverse();
  const current = items.map((d) => d?.current ?? 0).reverse();
  const voltage = items.map((d) => d?.voltage ?? 0).reverse();

  return { labels, power, current, voltage };
}

/** Power line chart with a dashed red threshold reference line. */
function PowerLineChart({ labels, powerData, threshold }) {
  const data = {
    labels,
    datasets: [
      {
        label: 'Power (W)',
        data: powerData,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: 1
      },
      {
        label: 'Threshold',
        data: Array(labels.length).fill(threshold),
        borderColor: '#ef4444',
        borderDash: [6, 4],   // dashed line to distinguish from real data
        borderWidth: 2,
        pointRadius: 0,
        fill: false
      }
    ]
  };
  return <Line data={data} options={chartOptions} />;
}

/** Current bar chart with amber bars. */
function CurrentBarChart({ labels, currentData }) {
  const data = {
    labels,
    datasets: [{
      label: 'Current (A)',
      data: currentData,
      backgroundColor: '#f59e0b',
      borderRadius: 4,
      barThickness: 'flex'
    }]
  };
  return <Bar data={data} options={chartOptions} />;
}

/** Voltage line chart with green fill. */
function VoltageLineChart({ labels, voltageData }) {
  const data = {
    labels,
    datasets: [{
      label: 'Voltage (V)',
      data: voltageData,
      borderColor: '#10b981',
      backgroundColor: 'rgba(16,185,129,0.06)',
      fill: true,
      tension: 0.3,
      pointRadius: 1
    }]
  };
  return <Line data={data} options={chartOptions} />;
}

export default function Dashboard() {
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Read the current threshold from localStorage (saved by Settings page).
  // Falls back to 3000W when nothing has been persisted yet.
  const [threshold, setThreshold] = useState(() => {
    const saved = localStorage.getItem('dorm_threshold');
    return saved ? parseInt(saved, 10) : 3000;
  });
  const intervalRef = useRef(null);

  // Sync threshold from localStorage every time the component renders
  // (Settings may have been updated while on a different page).
  useEffect(() => {
    const sync = () => {
      const saved = localStorage.getItem('dorm_threshold');
      if (saved) setThreshold(parseInt(saved, 10));
    };
    sync();
    // Listen for cross-tab changes too
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetchElectricityData(50);
      const items = res?.data || [];
      setRawData(items);
      setError('');
    } catch (e) {
      setError(e.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 15 seconds — clear on unmount to prevent memory leaks
  useEffect(() => {
    intervalRef.current = setInterval(load, 15000);
    return () => clearInterval(intervalRef.current);
  }, [load]);

  // Latest reading drives the stat cards and overload banner
  // Convert a UTC ISO timestamp to New Zealand local time for display.
  function toNZTime(isoStr) {
    if (!isoStr) return '--';
    try {
      return new Date(isoStr).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' });
    } catch { return isoStr; }
  }

  const latest = rawData.length > 0 ? rawData[0] : null;
  const isOverload = latest?.is_overload === true;
  const { labels, power, current, voltage } = chartDataFrom(rawData);

  // Stat card definitions — colour changes when overload is active
  const stats = [
    { label: 'Power', value: latest?.power ?? '--', unit: 'W', icon: '⚡', color: isOverload ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200', textColor: isOverload ? 'text-red-600' : 'text-blue-600' },
    { label: 'Current', value: latest?.current ?? '--', unit: 'A', icon: '🔌', color: 'bg-amber-50 border-amber-200', textColor: 'text-amber-600' },
    { label: 'Voltage', value: latest?.voltage ?? '--', unit: 'V', icon: '🔋', color: 'bg-green-50 border-green-200', textColor: 'text-green-600' },
    { label: 'Total Energy', value: latest?.cumulative_energy ?? '--', unit: 'kWh', icon: '📊', color: 'bg-purple-50 border-purple-200', textColor: 'text-purple-600' }
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-800">Dashboard</h2>

      {/* Overload warning banner — only rendered when the latest reading is over threshold */}
      {isOverload && (
        <div className="bg-red-600 text-white px-5 py-4 rounded-xl flex items-center gap-3 animate-pulse">
          <svg className="w-7 h-7 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div>
            <p className="font-bold text-lg">Overload Alert</p>
            <p className="text-red-100 text-sm">Power {latest?.power}W exceeds threshold {threshold}W!</p>
          </div>
        </div>
      )}

      {/* API error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {/* Stat cards — 2-column on mobile, 4-column on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <div key={i} className={`rounded-xl border p-4 ${s.color}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">{s.label}</span>
              <span className="text-lg">{s.icon}</span>
            </div>
            <p className={`text-2xl font-bold ${s.textColor}`}>
              {typeof s.value === 'number' ? s.value.toFixed(2) : s.value}
              <span className="text-sm font-normal ml-1">{s.unit}</span>
            </p>
          </div>
        ))}
      </div>

      {/*  Analytics row — computed from all loaded data points  */}
      {rawData.length > 0 && (() => {
        const powers = rawData.map(d => d?.power ?? 0);
        const avgPower = powers.reduce((a, b) => a + b, 0) / powers.length;
        const maxPower = Math.max(...powers);
        const overloadCount = rawData.filter(d => d?.is_overload).length;
        const margin = threshold - (latest?.power ?? 0);
        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">Max Power</p>
              <p className="text-xl font-bold text-orange-600">{maxPower.toFixed(0)} <span className="text-xs font-normal text-gray-400">W</span></p>
              <p className="text-xs text-gray-400 mt-0.5">in current window</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">Average Power</p>
              <p className="text-xl font-bold text-blue-600">{avgPower.toFixed(0)} <span className="text-xs font-normal text-gray-400">W</span></p>
              <p className="text-xs text-gray-400 mt-0.5">over {rawData.length} readings</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">Overload Events</p>
              <p className="text-xl font-bold text-red-600">{overloadCount} <span className="text-xs font-normal text-gray-400">/{rawData.length}</span></p>
              <p className="text-xs text-gray-400 mt-0.5">{overloadCount > 0 ? `${((overloadCount / rawData.length) * 100).toFixed(0)}% of readings` : 'No overload'}</p>
            </div>
            <div className={`bg-white rounded-xl border p-4 ${margin < 0 ? 'border-red-200' : 'border-gray-200'}`}>
              <p className="text-xs text-gray-500 mb-1">Power Margin</p>
              <p className={`text-xl font-bold ${margin < 0 ? 'text-red-600' : 'text-green-600'}`}>
                {margin > 0 ? '+' : ''}{margin.toFixed(0)} <span className="text-xs font-normal text-gray-400">W</span>
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{margin < 0 ? 'Over threshold!' : 'Below threshold'}</p>
            </div>
          </div>
        );
      })()}

      {/* Charts section — three states: loading, empty, data */}
      {loading && rawData.length === 0 ? (
        <div className="text-center py-20 text-gray-400">Loading...</div>
      ) : rawData.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-3">{'📡'}</p>
          <p>No data. Generate data via the Simulator.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Power Trend</h3>
            <div className="h-64">
              <PowerLineChart labels={labels} powerData={power} threshold={threshold} />
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Current Distribution</h3>
            <div className="h-64">
              <CurrentBarChart labels={labels} currentData={current} />
            </div>
          </div>
          {/* Voltage chart spans full width on desktop */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 lg:col-span-2">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Voltage Curve</h3>
            <div className="h-64">
              <VoltageLineChart labels={labels} voltageData={voltage} />
            </div>
          </div>
        </div>
      )}

      {/* Recent data table — only rendered when there is data */}
      {rawData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Recent Records</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Time</th>
                  <th className="text-right px-4 py-2.5 text-gray-500 font-medium">Power (W)</th>
                  <th className="text-right px-4 py-2.5 text-gray-500 font-medium">Current (A)</th>
                  <th className="text-right px-4 py-2.5 text-gray-500 font-medium">Voltage (V)</th>
                  <th className="text-center px-4 py-2.5 text-gray-500 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {/* Show at most 20 rows to keep the table performant */}
                {rawData.slice(0, 20).map((d, i) => (
                  // Red background row for overload events
                  <tr key={i} className={d?.is_overload ? 'bg-red-50' : 'hover:bg-gray-50'}>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap text-xs">{toNZTime(d?.timestamp)}</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${(d?.power ?? 0) > threshold ? 'text-red-600' : 'text-gray-700'}`}>{d?.power ?? '--'}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{d?.current ?? '--'}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{d?.voltage ?? '--'}</td>
                    <td className="px-4 py-2.5 text-center">
                      {d?.is_overload ? (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-100 px-2 py-0.5 rounded-full font-medium">
                          <span className="w-1.5 h-1.5 bg-red-500 rounded-full" /> Overload
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full font-medium">
                          <span className="w-1.5 h-1.5 bg-green-500 rounded-full" /> Normal
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
