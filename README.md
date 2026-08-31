English | [简体中文](README.zh-CN.md)

# Smart Dorm Energy Monitoring System

An IoT + Cloud integrated solution for real-time dormitory electricity monitoring,
overload detection, and automatic power cutoff. Built on AWS IoT Core + Lambda +
DynamoDB + Cognito + API Gateway, with a React-based web dashboard.

---

## System Architecture

Layer 1 - DEVICE (Raspberry Pi)
  aws_iot_publisher.py
  - Publishes simulated sensor data every 30s via MQTT
  - Subscribes to shadow delta for power_cutoff commands
  - Simulates relay power cutoff when overload detected

Layer 2 - CLOUD (AWS)
  - IoT Core——MQTT Broker, Device Shadow (dorm_energy_shadow)
  - Lambda——5 serverless functions (data processing + API handlers)
  - DynamoDB——3 tables: DormElectricData, DormSystemSettings, DormAlertHistory
  - API Gateway——4 REST endpoints: /data, /threshold, /simulate, /alerts
  - Cognito——Hosted UI OAuth 2.0 login (FORCE_CHANGE_PASSWORD built-in)
  - SNS——Email overload alerts to dorm staff
  - CloudWatch——Custom metrics (SmartDorm/EnergyMetrics) + Dashboard

Layer 3 - FRONTEND (Browser)
  React 18 + Vite + Tailwind CSS
  Pages: LandingPage, Dashboard, Simulator, AlertHistory, Settings

Data Flow: Device -> MQTT -> IoT Core -> Lambda -> DynamoDB + SNS + CloudWatch
Web Flow:  Browser -> Cognito Login -> API Gateway -> Lambda -> DynamoDB


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
- Compute:       AWS Lambda (Python 3.14, serverless)
- Storage:       AWS DynamoDB (NoSQL, 3 tables)
- Auth:          AWS Cognito Hosted UI (OAuth 2.0 authorization code grant)
- Messaging:     AWS SNS (email overload alerts)
- Monitoring:    AWS CloudWatch (custom metrics + dashboard)
- Device Mgmt:   AWS IoT Core (MQTT broker + named shadow)
- Frontend:      React 18 + Vite + Tailwind CSS + Chart.js + Axios

---

## How to Access the System

 you can access the complete system with:

- The frontend URL http://localhost:5173 （When you run the front-end page locally）
- A valid Cognito user account created by the project owner

**You do NOT need:** your own AWS account, API keys, database setup,
or any backend configuration. The frontend already points to the owner's
AWS cloud backend. Simply open the URL, sign in with the provided
Cognito account, and all four pages (Dashboard, Simulator, Alert History,
Settings) are fully accessible.

---

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Python 3.14+ and pip
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

### Lambda Functions & IAM Permissions

Each Lambda needs an IAM Role. Create one role per function (or a shared
role with all permissions). Attach the following AWS managed policies:

**ALL Lambdas (common base)**
- AWSLambdaBasicExecutionRole
  (writes logs to CloudWatch Logs — required for every function)

**lambda_function.py (main data processor)**
- AWSLambdaBasicExecutionRole
- AmazonDynamoDBFullAccess
  (reads settings, writes sensor data and alert history)
- AWSIoTDataAccess
  (UpdateThingShadow + GetThingShadow on IoT Device Shadow)
- AmazonSNSFullAccess
  (publishes overload alert emails)
- CloudWatchFullAccess
  (publishes custom metrics to SmartDorm/EnergyMetrics namespace)

**GetElectricityData.py (GET /data)**
- AWSLambdaBasicExecutionRole
- AmazonDynamoDBFullAccess
  (queries DormElectricData)

**UpdateAlertThreshold.py (PUT /threshold)**
- AWSLambdaBasicExecutionRole
- AmazonDynamoDBFullAccess
  (writes DormSystemSettings, queries DormElectricData, writes DormAlertHistory)
- AWSIoTDataAccess
  (updates shadow when threshold change triggers cutoff)
- AmazonSNSFullAccess
  (sends alert if new threshold causes overload)

**SimulateDeviceData.py (POST /simulate)**
- AWSLambdaBasicExecutionRole
- AWSIoTDataAccess
  (publishes simulated MQTT to IoT Core)

**GetAlertHistory.py (GET /alerts)**
- AWSLambdaBasicExecutionRole
- AmazonDynamoDBFullAccess
  (scans DormAlertHistory)

### How to attach policies (AWS Console)

1. IAM Console -> Roles -> Create role
2. Trusted entity: Lambda
3. Search and check each policy name (e.g. "AWSLambdaBasicExecutionRole")
4. Name the role (e.g. "DormEnergy-MainProcessor-Role")
5. Assign this role to the Lambda in Lambda Console -> Configuration -> Permissions

### Lambda common settings

- Runtime: Python 3.14
- Architecture: x86_64
- Timeout: 30 seconds


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
