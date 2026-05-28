# Smart Dorm Energy Monitoring System

An IoT + Cloud integrated solution for real-time dormitory electricity monitoring,
overload detection, and automatic power cutoff. Built on AWS IoT Core + Lambda +
DynamoDB + Cognito + API Gateway, with a React-based web dashboard.

---

## System Architecture

Three-layer architecture:

  [DEVICE LAYER]  Raspberry Pi running aws_iot_publisher.py
       |          Publishes simulated sensor data every 30s
       |          Subscribes to shadow delta for power_cutoff
       |
       |  MQTT (TLS 1.2, port 8883)
       v
  [CLOUD LAYER]  AWS Services
       |
       |  IoT Core      -- MQTT Broker + Device Shadow (dorm_energy_shadow)
       |  Lambda        -- Data processing + API handlers (5 functions)
       |  DynamoDB      -- DormElectricData / DormSystemSettings / DormAlertHistory
       |  API Gateway   -- /data /threshold /simulate /alerts
       |  Cognito       -- Hosted UI OAuth 2.0 login
       |  SNS           -- Email overload alerts
       |  CloudWatch    -- Custom metrics + Dashboard
       |
       |  HTTPS
       v
  [FRONTEND]  React + Vite + Tailwind CSS
       |
       |  LandingPage  -- "Sign In with AWS Cognito"
       |  Dashboard    -- Charts, stats, analytics, data table
       |  Simulator    -- Custom parameter test tool
       |  AlertHistory -- Overload event records
       |  Settings     -- Threshold control + cutoff flow

Diagram code for mermaid.live: see docs/architecture-diagram.md

---

## Project Files

```
AS2/
  README.md
  Lambda/
    lambda_function.py              Main data processor
    GetElectricityData.py           GET /data
    UpdateAlertThreshold.py         PUT /threshold + shadow update
    SimulateDeviceData.py           POST /simulate
    GetAlertHistory.py              GET /alerts
  app/
    aws_iot_publisher.py            Device simulator (MQTT + shadow)
  dorm-energy-frontend/
    index.html
    package.json
    vite.config.js
    tailwind.config.js
    postcss.config.js
    src/
      main.jsx                      Entry point
      App.jsx                       Root component + auth gate
      config.js                     API & Cognito constants
      api.js                        Axios wrapper
      auth.js                       Cognito OAuth code flow
      index.css
      components/
        ErrorBoundary.jsx           Catches render errors
        LandingPage.jsx             Welcome + Sign In button
        Header.jsx                  Top bar + user menu + logout
        Sidebar.jsx                 Desktop navigation
        MobileNav.jsx               Mobile bottom tabs
        Dashboard.jsx               Charts + stats + analytics
        Simulator.jsx               Custom telemetry test
        Alerts.jsx                  Overload history table
        Settings.jsx                Threshold + cutoff flow
  docs/
    architecture-diagram.md         Mermaid code for system diagram
    report-continuation.md          Report chapters 2-9
  reference/                        Research papers
```

---

## Tech Stack

- Device:        Python + paho-mqtt (MQTT publishing + shadow subscription)
- Communication: MQTT (TLS 1.2, port 8883)
- API:           AWS API Gateway (REST, 4 endpoints)
- Compute:       AWS Lambda (Python 3.9, serverless)
- Storage:       AWS DynamoDB (NoSQL, 3 tables)
- Auth:          AWS Cognito Hosted UI (OAuth 2.0 authorization code grant)
- Messaging:     AWS SNS (email overload alerts)
- Monitoring:    AWS CloudWatch (custom metrics + dashboard)
- Device Mgmt:   AWS IoT Core (MQTT broker + named shadow)
- Frontend:      React 18 + Vite + Tailwind CSS + Chart.js + Axios

---

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Python 3.9+ and pip
- AWS account with: Cognito User Pool, IoT Core Thing + certificates,
  Lambda functions deployed, API Gateway routes, IAM roles

### Frontend

```
cd dorm-energy-frontend
npm install
npm run dev          # http://localhost:5173
npm run build        # production -> dist/
```

### Device Simulator

```
cd app
pip install paho-mqtt
python aws_iot_publisher.py
```

### Lambda Deployment

1. Open each .py file in Lambda/ in AWS Lambda Console
2. Set Runtime: Python 3.9+
3. Set Timeout: 30 seconds
4. Click Deploy

### Cognito Hosted UI Configuration

AWS Console -> Cognito -> App Client -> Hosted UI:

- Allowed Callback URLs:  http://localhost:5173
- Allowed Sign-out URLs:  http://localhost:5173
- OAuth Grant Types:      Authorization code grant
- OAuth Scopes:           email, openid, phone

---

## API Reference

Base URL: https://n9lxkwwoch.execute-api.ap-southeast-2.amazonaws.com/dev

GET  /data       ?limit=100  -> Recent electricity readings
PUT  /threshold  {threshold} -> Update overload threshold
POST /simulate   {power} or {current,voltage} -> Publish test data
GET  /alerts     ?limit=50   -> Overload event history

---

## DynamoDB Tables

DormElectricData   PK: deviceId  SK: timestamp  (sensor readings)
DormSystemSettings  PK: settingId                (overload_threshold)
DormAlertHistory    PK: alertId                  (overload events)

---

## MQTT Topics

dorm/electricity/data                               Device -> Cloud  (telemetry)
$aws/things/DormRaspberryPi/shadow/name/
  dorm_energy_shadow/update/delta                   Cloud -> Device  (cutoff cmd)
$aws/things/DormRaspberryPi/shadow/name/
  dorm_energy_shadow/update                         Device -> Cloud  (confirmation)

---

## Key Features

- Dashboard: Power/Current/Voltage charts, stats cards, analytics row,
  data table, 15s auto-refresh, overload red banner
- Overload Detection: Configurable threshold, SNS email, IoT shadow cutoff
- Power Cutoff: Web -> threshold change -> Lambda -> Device Shadow ->
  Raspberry Pi relay simulation
- Simulator: Manual telemetry injection, 3 quick scenarios, custom params
- Cloud Analytics: CloudWatch metrics (SmartDorm/EnergyMetrics) + Dashboard
- Auth: Cognito Hosted UI OAuth, no SDK, FORCE_CHANGE_PASSWORD built-in
- Responsive: Sidebar on desktop, bottom tabs on mobile
- ErrorBoundary: Catches render errors -> shows reload page (never blank)

---

## Troubleshooting

Blank page on localhost
  -> rm -rf node_modules/.vite && npm run dev

"Invalid request" on Cognito Login
  -> Add http://localhost:5173 to Allowed Callback URLs in Cognito Console

"Invalid request" on Logout
  -> Add http://localhost:5173 to Allowed Sign-out URLs in Cognito Console

MQTT connection failed
  -> Check CA_FILE, CERT_FILE, KEY_FILE paths in aws_iot_publisher.py

Shadow delta not received by device
  -> Confirm topics use /name/dorm_energy_shadow/ segment (named shadow)

CloudWatch metrics not appearing
  -> Add cloudwatch:PutMetricData to Lambda IAM role

Simulator shows random values instead of input
  -> Deploy latest SimulateDeviceData.py (supports current/voltage params)

Dashboard threshold line doesn't update
  -> Deploy latest Settings.jsx (calls localStorage.setItem on save)

---

## License

Academic project - Smart Dorm EnergyGuard, 2026.
