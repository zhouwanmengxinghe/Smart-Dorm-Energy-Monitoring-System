/**
 * Settings — System configuration page.
 *
 * Supports one setting: the overload power threshold.
 *
 * The threshold is persisted to DynamoDB (DormSystemSettings table)
 * via PUT /threshold. The backend Lambda (UpdateAlertThreshold.py):
 *   1. Saves the new threshold.
 *   2. Queries the latest power reading from DormElectricData.
 *   3. Checks whether current power exceeds the new threshold.
 *   4. Updates the IoT device shadow with desired.power_cutoff flag.
 *   5. If overloaded, sends SNS alert + logs to DormAlertHistory.
 *
 * The frontend displays an overload warning banner when the API
 * response indicates is_overload === true after a threshold change.
 */

import React, { useState, useCallback } from 'react';
import { updateThreshold } from '../api';

export default function Settings() {
  const [thresholdInput, setThresholdInput] = useState('3000');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  // Tracks whether the latest reading exceeds the newly-saved threshold
  const [overloadAfterSave, setOverloadAfterSave] = useState(null);

  const presets = [
    { label: '1.5kW', value: 1500 },
    { label: '2.0kW', value: 2000 },
    { label: '3.0kW', value: 3000 },
    { label: '5.0kW', value: 5000 }
  ];

  const handleSave = useCallback(async () => {
    const val = parseFloat(thresholdInput);
    if (isNaN(val) || val <= 0) {
      setMessage({ text: 'Please enter a valid power value (>0)', type: 'error' });
      return;
    }
    setSaving(true);
    setMessage({ text: '', type: '' });
    setOverloadAfterSave(null);
    try {
      const res = await updateThreshold(val);
      // Persist to localStorage so Dashboard chart picks up the new threshold
      localStorage.setItem('dorm_threshold', String(val));
      // The Lambda returns is_overload and current_power in the response
      if (res?.is_overload) {
        setOverloadAfterSave({ power: res.current_power, threshold: res.threshold });
        setMessage({
          text: `Threshold saved (${val}W) — but current power ${res.current_power}W already exceeds it! Device shadow set to power_cutoff=true.`,
          type: 'error'
        });
      } else {
        setMessage({ text: res?.message || `Threshold updated to ${val}W`, type: 'success' });
      }
    } catch (e) {
      setMessage({ text: e.message || 'Update failed', type: 'error' });
    } finally {
      setSaving(false);
    }
  }, [thresholdInput]);

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-xl font-bold text-gray-800">System Settings</h2>

      {/* ── Overload warning after threshold change ────────────── */}
      {overloadAfterSave && (
        <div className="bg-red-600 text-white px-5 py-4 rounded-xl flex items-center gap-3 animate-pulse">
          <svg className="w-7 h-7 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div>
            <p className="font-bold text-lg">Power Cutoff Triggered</p>
            <p className="text-red-100 text-sm">
              Current power {overloadAfterSave.power}W exceeds new threshold {overloadAfterSave.threshold}W.
              The device shadow has been set to <strong>power_cutoff=true</strong>.
              The dorm power will be disconnected.
            </p>
          </div>
        </div>
      )}

      {/* ── Threshold configuration card ──────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-1">Overload Threshold</h3>
        <p className="text-sm text-gray-500 mb-6">
          When total dorm power exceeds this threshold, the system triggers an overload alert
          via SNS email, updates the IoT device shadow with <code className="bg-gray-100 px-1 rounded">power_cutoff=true</code>,
          and the device will disconnect dorm power.
        </p>

        <div className="flex gap-2 mb-5">
          {presets.map((p) => (
            <button
              key={p.value}
              onClick={() => { setThresholdInput(String(p.value)); setMessage({ text: '', type: '' }); setOverloadAfterSave(null); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                String(p.value) === thresholdInput
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Threshold (W)</label>
            <input
              type="number"
              value={thresholdInput}
              onChange={(e) => { setThresholdInput(e.target.value); setMessage({ text: '', type: '' }); setOverloadAfterSave(null); }}
              min="1"
              step="100"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-800"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>

        {message.text && (
          <div className={`mt-4 px-4 py-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}
      </div>

      {/* ── System architecture overview ──────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Power Cutoff Flow</h3>
        <div className="space-y-3 text-sm text-gray-600">
          <div className="flex gap-3">
            <span className="text-blue-500 mt-0.5">{'1.'}</span>
            <p><strong>Web UI</strong> — User changes overload threshold → PUT /threshold API.</p>
          </div>
          <div className="flex gap-3">
            <span className="text-blue-500 mt-0.5">{'2.'}</span>
            <p><strong>Lambda</strong> — Saves threshold to DynamoDB, checks latest power reading against new threshold.</p>
          </div>
          <div className="flex gap-3">
            <span className="text-blue-500 mt-0.5">{'3.'}</span>
            <p><strong>IoT Shadow</strong> — Lambda updates <code className="bg-gray-100 px-1 rounded">desired.power_cutoff = true</code> if overloaded.</p>
          </div>
          <div className="flex gap-3">
            <span className="text-blue-500 mt-0.5">{'4.'}</span>
            <p><strong>Device (Raspberry Pi)</strong> — Subscribes to shadow delta, detects power_cutoff flag, triggers relay to cut dorm power.</p>
          </div>
          <div className="flex gap-3">
            <span className="text-blue-500 mt-0.5">{'5.'}</span>
            <p><strong>SNS + Alert History</strong> — Email sent to dorm staff; event logged to DormAlertHistory.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
