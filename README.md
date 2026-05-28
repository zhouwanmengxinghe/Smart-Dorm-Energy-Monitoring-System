# Smart Dorm Energy Monitoring System (智能宿舍用电监控系统)

An IoT + Cloud integrated solution for real-time dormitory electricity monitoring,
overload detection, and automatic power cutoff. Built on **AWS IoT Core + Lambda +
DynamoDB + Cognito + API Gateway**, with a React-based web dashboard.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                       DEVICE LAYER (Raspberry Pi)                    │
│                                                                      │
│  aws_iot_publisher.py                                                │
│  ┌──────────────────────────────────────────────────────┐           │
│  │  • Publishes simulated sensor data every 30s          │           │
│  │    (Voltage / Current / Power / Cumulative Energy)    │           │
│  │  • Subscribes to device shadow delta                  │           │
│  │  • Simulates relay power cutoff when commanded        │           │
│  └──────────────────┬───────────────────────────────────┘           │
└─────────────────────┼───────────────────────────────────────────────┘
                      │ MQTT (TLS 1.2, port 8883)
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    AWS CLOUD LAYER                                    │
│                                                                      │
│  ┌──────────────┐     ┌─────────────────────────────────────┐       │
│  │  API Gateway  │────▶│  Lambda (lambda_function.py)         │       │
│  │  /data  GET   │     │  • Validates incoming data           │       │
│  │  /threshold   │     │  • Reads dynamic threshold           │       │
│  │       PUT     │     │  • Checks overload                   │       │
│  │  /simulate    │     │  • Updates device shadow             │       │
│  │       POST    │     │  • Sends SNS alerts                  │       │
│  │  /alerts GET  │     │  • Publishes CloudWatch metrics      │       │
│  └──────┬───────┘     └───┬──────────┬──────────┬────────────┘       │
│         │                 │          │          │                    │
│         ▼                 ▼          ▼          ▼                    │
│  ┌──────────┐   ┌──────────┐  ┌────────┐  ┌──────────────┐         │
│  │ Cognito  │   │DynamoDB  │  │  SNS   │  │CloudWatch    │         │
│  │ Hosted UI│   │          │  │ Email  │  │Dashboard     │         │
│  │          │   │ DormElec │  │Alerts  │  │              │         │
│  │ OAuth 2.0│   │ tricData │  │        │  │SmartDorm/    │         │
│  │          │   │ DormSyst │  │        │  │EnergyMetrics │         │
│  │          │   │ emSettin │  └────────┘  └──────────────┘         │
│  │          │   │ gs       │                                        │
│  │          │   │ DormAler │                                         │
│  │          │   │ tHistory │                                         │
│  └──────────┘   └──────────┘                                         │
│                                                                      │
│                    ┌──────────────┐                                  │
│                    │  IoT Core     │                                 │
│                    │              │                                  │
│                    │ MQTT Broker  │                                  │
│                    │ Device       │                                  │
│                    │ Shadow       │                                  │
│                    │ dorm_energy  │                                  │
│                    │ _shadow      │                                  │
│                    └──────────────┘                                  │
└─────────────────────────────────────────────────────────────────────┘
                      │ HTTPS
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FRONTEND (React + Vite + Tailwind)                 │
│                                                                      │
│  ┌──────────────────────────────────────────────────┐               │
│  │  LandingPage → Cognito Hosted UI Login            │               │
│  │                                                    │               │
│  │  ┌─────────────┐  ┌──────────┐  ┌──────────┐     │               │
│  │  │ Dashboard   │  │Simulator │  │ Settings  │     │               │
│  │  │             │  │          │  │           │     │               │
│  │  │ Charts      │  │ Power    │  │Threshold  │     │               │
│  │  │ Stats Cards │  │Current   │  │ Presets   │     │               │
│  │  │ Analytics   │  │Voltage   │  │Overload   │     │               │
│  │  │ Data Table  │  │Scenarios │  │Warning    │     │               │
│  │  └─────────────┘  └──────────┘  └──────────┘     │               │
│  │                                                    │               │
│  │  ┌─────────────┐                                  │               │
│  │  │Alert History│   Sidebar + Mobile Bottom Nav    │               │
│  │  │             │   Header + User Menu (Sign Out)  │               │
│  │  │Data Table   │   ErrorBoundary (no blank pages) │               │
│  │  └─────────────┘                                  │               │
│  └──────────────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
AS2/
├── README.md                          # This file
├── Lambda/                            # AWS Lambda functions (Python 3.x)
│   ├── lambda_function.py             # Main IoT data processor
│   ├── GetElectricityData.py          # GET /data — query recent readings
│   ├── UpdateAlertThreshold.py        # PUT /threshold — save + re-evaluate
│   ├── SimulateDeviceData.py          # POST /simulate — publish test data
│   └── GetAlertHistory.py             # GET /alerts — overload event log
├── app/                               # Raspberry Pi device simulator
│   └── aws_iot_publisher.py           # MQTT publisher + shadow subscriber
├── dorm-energy-frontend/              # React SPA (Vite + Tailwind CSS)
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── src/
│       ├── main.jsx                   # Entry point + React mount
│       ├── App.jsx                    # Root component + auth gate
│       ├── config.js                  # API & Cognito constants
│       ├── api.js                     # Axios wrapper (4 endpoints)
│       ├── auth.js                    # Cognito OAuth code flow
│       ├── index.css                  # Tailwind + custom scrollbar
│       └── components/
│           ├── ErrorBoundary.jsx      # React error boundary
│           ├── LandingPage.jsx        # "Sign In with Cognito" entry
│           ├── Header.jsx             # Top bar + user menu + logout
│           ├── Sidebar.jsx            # Desktop sidebar navigation
│           ├── MobileNav.jsx          # Mobile bottom tab bar
│           ├── Dashboard.jsx          # Charts + stats + analytics + table
│           ├── Simulator.jsx          # Custom telemetry test tool
│           ├── Alerts.jsx             # Overload history table
│           └── Settings.jsx           # Threshold management + cutoff flow
└── reference/                         # Research papers (PDFs)
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Device | Python + paho-mqtt | MQTT data publishing, shadow subscription |
| Communication | MQTT (TLS 1.2) | Bidirectional IoT messaging |
| API | AWS API Gateway | REST endpoints for frontend |
| Compute | AWS Lambda (Python 3.x) | Serverless data processing |
| Storage | AWS DynamoDB | NoSQL for sensor data, settings, alerts |
| Auth | AWS Cognito Hosted UI | OAuth 2.0 authorization code flow |
| Messaging | AWS SNS | Email overload alerts |
| Monitoring | AWS CloudWatch | Custom metrics + dashboard |
| Device Mgmt | AWS IoT Core | MQTT broker + device shadow |
| Frontend | React 18 + Vite + Tailwind | SPA with charts (Chart.js) + Axios |

---

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Python 3.9+ and pip
- AWS account with configured:
  - Cognito User Pool + App Client (Hosted UI enabled)
  - IoT Core Thing + certificates
  - DynamoDB tables (created automatically by Lambda)
  - Lambda functions deployed
  - API Gateway routes configured
  - IAM roles with required policies

### 1. Frontend

```bash
cd dorm-energy-frontend
npm install
npm run dev       # http://localhost:5173
npm run build     # production build → dist/
```

### 2. Device Simulator

```bash
cd app
pip install paho-mqtt
python aws_iot_publisher.py
```

### 3. Lambda Deployment

1. Open each `.py` file in `Lambda/` in the AWS Lambda Console
2. Set Runtime to Python 3.9+
3. Adjust timeout to 30 seconds
4. Click **Deploy**

### 4. Cognito App Client Configuration

In AWS Console → Cognito → App Client → Hosted UI:

| Setting | Value |
|---------|-------|
| Allowed Callback URLs | `http://localhost:5173` |
| Allowed Sign-out URLs | `http://localhost:5173` |
| OAuth Grant Types | Authorization code grant |
| OAuth Scopes | email, openid, phone |

---

## API Reference

All endpoints are proxied through **API Gateway** at:
```
https://n9lxkwwoch.execute-api.ap-southeast-2.amazonaws.com/dev
```

| Method | Path | Description | Body / Params |
|--------|------|-------------|---------------|
| `GET` | `/data` | Recent electricity readings | `?limit=100` |
| `PUT` | `/threshold` | Update overload threshold | `{ "threshold": 3000 }` |
| `POST` | `/simulate` | Publish test telemetry | `{ "power": 800 }` or `{ "current": 10, "voltage": 230 }` |
| `GET` | `/alerts` | Overload event history | `?limit=50` |

---

## Key Features

- **Real-time Dashboard**: Power/Current/Voltage charts (Chart.js), analytics cards, data table with 15-second auto-refresh
- **Overload Detection**: Configurable threshold, automatic SNS email alerts, IoT shadow `power_cutoff` command
- **Power Cutoff**: Web threshold change → Lambda → Device Shadow → Raspberry Pi relay simulation
- **Simulator**: Manual telemetry injection for testing overload scenarios
- **Cloud Analytics**: CloudWatch custom metrics (SmartDorm/EnergyMetrics) + Dashboard with 4+ widgets
- **Auth**: Cognito Hosted UI OAuth — zero SDK dependencies, full FORCE_CHANGE_PASSWORD support
- **Responsive UI**: Sidebar on desktop, bottom tab bar on mobile; ErrorBoundary prevents blank pages

---

## DynamoDB Tables

| Table | Partition Key | Sort Key | Purpose |
|-------|--------------|----------|---------|
| `DormElectricData` | `deviceId` | `timestamp` | Sensor readings |
| `DormSystemSettings` | `settingId` | — | Overload threshold |
| `DormAlertHistory` | `alertId` | — | Overload event log |

---

## MQTT Topics

| Topic | Direction | Purpose |
|-------|-----------|---------|
| `dorm/electricity/data` | Device → Cloud | Sensor telemetry |
| `$aws/things/DormRaspberryPi/shadow/name/dorm_energy_shadow/update/delta` | Cloud → Device | Power cutoff commands |
| `$aws/things/DormRaspberryPi/shadow/name/dorm_energy_shadow/update` | Device → Cloud | Cutoff confirmation |

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| Blank page on localhost:5173 | Vite cache corruption | `rm -rf node_modules/.vite && npm run dev` |
| "Invalid request" on login | Callback URL not in App Client | Add `http://localhost:5173` to Cognito Allowed Callback URLs |
| "Invalid request" on logout | Logout URL not in App Client | Add `http://localhost:5173` to Cognito Allowed Sign-out URLs |
| MQTT connection failed | Wrong certificate path | Verify `CA_FILE`, `CERT_FILE`, `KEY_FILE` paths in `aws_iot_publisher.py` |
| Shadow delta not received | Named shadow topic mismatch | Ensure topics use `/name/dorm_energy_shadow/` segment |
| CloudWatch metrics not found | IAM missing `cloudwatch:PutMetricData` | Add inline policy to Lambda execution role |
| Simulator shows wrong values | Lambda doesn't read current/voltage | Ensure latest `SimulateDeviceData.py` is deployed |

---

## License

Academic project — Smart Dorm EnergyGuard, 2026.
