/**
 * Simulator — Publish simulated device telemetry to AWS IoT Core.
 *
 * Two input modes:
 *   1. "By Power"   — user enters power (W), the Lambda auto-calculates
 *      current based on a nominal 230 V reference.
 *   2. "By Current + Voltage" — user enters both values explicitly.
 *
 * Three quick-scenario buttons (Normal Load / Mild Overload / Heavy
 * Overload) populate the form with preset power values so the user can
 * test overload detection without manual typing.
 *
 * The Lambda (SimulateDeviceData) generates random voltage and
 * cumulative energy unless overridden, publishes to the MQTT topic
 * dorm/electricity/data, and writes the record to DynamoDB. The
 * main Lambda (lambda_function.py) then evaluates the reading against
 * the threshold and triggers SNS + alert history if overloaded.
 */

import React, { useState } from 'react';
import { simulateDevice } from '../api';

export default function Simulator() {
  const [power, setPower] = useState('');
  const [current, setCurrent] = useState('');
  const [voltage, setVoltage] = useState('');
  // Toggle between "power" (single-input) and "current" (dual-input) mode
  const [mode, setMode] = useState('power');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // Preset scenarios for quick overload testing
  const scenarios = [
    { label: 'Normal Load', power: 800, desc: 'Normal dorm power usage' },
    { label: 'Mild Overload', power: 3500, desc: 'Exceeds 3000W threshold' },
    { label: 'Heavy Overload', power: 5500, desc: 'High-power appliance overload' }
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);

    const payload = {};
    if (mode === 'power') {
      const p = parseFloat(power);
      if (isNaN(p) || p <= 0) { setError('Please enter a valid power value'); return; }
      payload.power = p;
    } else {
      const c = parseFloat(current);
      const v = parseFloat(voltage);
      if (isNaN(c) || c <= 0) { setError('Please enter a valid current value'); return; }
      if (isNaN(v) || v <= 0) { setError('Please enter a valid voltage value'); return; }
      payload.current = c;
      payload.voltage = v;
    }

    setSending(true);
    try {
      const res = await simulateDevice(payload);
      // Lambda returns { success, data: { voltage, current, power, cumulative_energy } }
      setResult(res?.data || res);
      // Clear inputs on success so the user can send again
      setPower(''); setCurrent(''); setVoltage('');
    } catch (e) {
      setError(e.message || 'Failed to send simulation data');
    } finally {
      setSending(false);
    }
  };

  // Populate the form with a preset scenario value
  const applyScenario = (scenario) => {
    setMode('power');
    setPower(String(scenario.power));
    setCurrent('');
    setVoltage('');
    setResult(null);
    setError('');
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-xl font-bold text-gray-800">Simulator</h2>

      {/* Quick scenario buttons */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Quick Scenarios</h3>
        <div className="flex flex-wrap gap-2">
          {scenarios.map((s) => (
            <button
              key={s.label}
              onClick={() => applyScenario(s)}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm hover:bg-blue-50 hover:border-blue-300 transition-colors text-left"
            >
              <p className="font-medium text-gray-700">{s.label}</p>
              <p className="text-xs text-gray-400">{s.desc} ({s.power}W)</p>
            </button>
          ))}
        </div>
      </div>

      {/* Custom parameter form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Custom Parameters</h3>

        {/* Mode toggle — segmented control style */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-5 w-fit">
          <button
            onClick={() => setMode('power')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === 'power' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            By Power
          </button>
          <button
            onClick={() => setMode('current')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === 'current' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            By Current + Voltage
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'power' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Power (W)</label>
              <input
                type="number"
                value={power}
                onChange={(e) => setPower(e.target.value)}
                placeholder="Enter power, e.g. 3000"
                min="1" step="any"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-800"
              />
              <p className="text-xs text-gray-400 mt-1">Current auto-calculated from 230V reference</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Current (A)</label>
                <input
                  type="number"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  placeholder="Enter current, e.g. 10"
                  min="0.1" step="any"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-800"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Voltage (V)</label>
                <input
                  type="number"
                  value={voltage}
                  onChange={(e) => setVoltage(e.target.value)}
                  placeholder="Enter voltage, e.g. 230"
                  min="1" step="any"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-800"
                />
              </div>
            </>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
          )}

          <button
            type="submit"
            disabled={sending}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {sending ? (
              <>
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Sending...
              </>
            ) : (
              'Send Simulation'
            )}
          </button>
        </form>

        {/* Result card — shows the values the Lambda published */}
        {result && (
          <div className="mt-5 bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm font-medium text-green-700 mb-2">Data published to IoT Core</p>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-gray-500">Power</p>
                <p className="text-lg font-bold text-gray-800">{result?.power?.toFixed(1) ?? '--'} <span className="text-xs font-normal">W</span></p>
              </div>
              <div>
                <p className="text-gray-500">Current</p>
                <p className="text-lg font-bold text-gray-800">{result?.current?.toFixed(2) ?? '--'} <span className="text-xs font-normal">A</span></p>
              </div>
              <div>
                <p className="text-gray-500">Voltage</p>
                <p className="text-lg font-bold text-gray-800">{result?.voltage?.toFixed(1) ?? '--'} <span className="text-xs font-normal">V</span></p>
              </div>
            </div>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-4">
          Data is published via Lambda to AWS IoT Core MQTT topic dorm/electricity/data,
          written to DynamoDB, and evaluated by the overload detection logic.
        </p>
      </div>
    </div>
  );
}
