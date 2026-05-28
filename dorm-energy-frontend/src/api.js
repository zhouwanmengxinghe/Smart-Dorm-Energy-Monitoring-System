/**
 * api.js — Axios wrapper for the four backend Lambda endpoints.
 *
 * All requests go through AWS API Gateway (no Authorization header —
 * the API Gateway stage has no authorizer configured, by design).
 *
 * Endpoints mirror the Lambda function names:
 *   GET  /data       → GetElectricityData
 *   PUT  /threshold  → UpdateAlertThreshold
 *   POST /simulate   → SimulateDeviceData
 *   GET  /alerts     → GetAlertHistory
 */

import axios from 'axios';
import config from './config';

// Shared Axios instance — base URL + JSON content type for every request
const api = axios.create({
  baseURL: config.API_BASE_URL,
  headers: { 'Content-Type': 'application/json' }
});

/**
 * Fetch the most recent electricity readings from DynamoDB.
 * @param {number} limit — max records to return (default 100)
 */
export async function fetchElectricityData(limit = 100) {
  const res = await api.get('/data', { params: { limit } });
  return res.data;
}

/**
 * Persist a new overload threshold to DormSystemSettings table.
 * @param {number} threshold — power threshold in watts
 */
export async function updateThreshold(threshold) {
  const res = await api.put('/threshold', { threshold });
  return res.data;
}

/**
 * Publish simulated device telemetry to IoT Core via the SimulateDeviceData Lambda.
 * The Lambda generates realistic voltage/current/energy values unless overridden.
 * @param {object} data — optional { power, current, voltage }
 */
export async function simulateDevice(data) {
  const res = await api.post('/simulate', data);
  return res.data;
}

/**
 * Fetch overload alert history from DormAlertHistory table.
 * @param {number} limit — max records to return (default 50)
 */
export async function fetchAlertHistory(limit = 50) {
  const res = await api.get('/alerts', { params: { limit } });
  return res.data;
}
