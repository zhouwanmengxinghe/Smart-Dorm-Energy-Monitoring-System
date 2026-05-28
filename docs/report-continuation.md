# SmartDorm EnergyGuard: An IoT-Cloud Based Real-Time Dormitory Electricity Monitoring System

> 以下为报告第 2–8 章节完整内容。包含 `[INSERT_IMAGE: ...]` 占位符，替换为对应截图或图表即可。所有英文内容可按需翻译为中文。

---

## 2. System Design

### 2.1 Overall Architecture

The system adopts a three-layer IoT-cloud architecture:

- **Device Layer**: Raspberry Pi simulates sensor data collection (voltage, current, power, cumulative energy) and publishes via MQTT to AWS IoT Core every 30 seconds. The device simultaneously subscribes to IoT Device Shadow delta events to receive power cutoff commands.
- **Cloud Layer**: AWS IoT Core acts as the MQTT broker and device shadow manager. An IoT Rule routes incoming MQTT messages to an AWS Lambda function for processing. API Gateway exposes four REST endpoints for the frontend. DynamoDB stores all persistent data. Cognito handles OAuth 2.0 authentication. SNS delivers email alerts. CloudWatch collects custom metrics for analytics.
- **Application Layer**: A React SPA served as a static website provides the user dashboard with real-time charts, remote threshold control, simulation tools, and alert history.

### 2.2 System Block Diagram

`[INSERT_IMAGE: System Architecture Diagram — Paste the diagram exported from https://mermaid.live using code in docs/architecture-diagram.md, or use the ASCII diagram from README.md]`

### 2.3 Hardware and Service Selection

| Component | Selection | Rationale |
|-----------|-----------|-----------|
| IoT Hardware | Raspberry Pi (simulated) | Widely available, Python SDK, GPIO for future relay integration |
| MQTT Broker | AWS IoT Core | Fully managed, supports millions of concurrent devices, built-in device shadow for bidirectional communication |
| API Layer | AWS API Gateway | Serverless REST endpoints, auto-scaling, CORS support, integrates directly with Lambda |
| Compute | AWS Lambda (Python 3.9) | Serverless — no server management, pay-per-execution, auto-scales from 0 to thousands of concurrent invocations |
| Authentication | AWS Cognito Hosted UI | Fully managed OAuth 2.0 provider, built-in FORCE_CHANGE_PASSWORD, zero frontend SDK dependency |
| Database | AWS DynamoDB | NoSQL key-value store with single-digit millisecond latency, auto-scaling, fully managed — ideal for time-series IoT data |
| Notifications | AWS SNS | Push email notifications to dormitory staff on overload events |
| Monitoring | AWS CloudWatch | Custom metrics, dashboards, log aggregation — enables data analytics without external tools |
| Frontend | React 18 + Vite + Tailwind CSS + Chart.js | Fast dev server, small bundle, responsive design, no additional SDK for auth |

### 2.4 Communication Protocols and Data Flow

**MQTT** was chosen for device-to-cloud communication because:
- Lightweight binary protocol ideal for constrained devices
- Persistent connection reduces overhead compared to HTTP polling
- QoS levels (we use QoS 1 — at least once delivery)
- Built-in TLS 1.2 encryption
- AWS IoT Core natively supports MQTT

**HTTPS/REST** was chosen for frontend-to-cloud communication because:
- Standard protocol supported by all browsers
- API Gateway provides request validation and throttling
- No persistent connection needed for user-facing requests

**Data Flow**:
1. Raspberry Pi → MQTT publish `dorm/electricity/data` → AWS IoT Core → IoT Rule triggers Lambda
2. Lambda validates, reads threshold from DynamoDB, checks overload, writes to DynamoDB, updates device shadow, publishes CloudWatch metrics, sends SNS if overloaded
3. Shadow delta (`power_cutoff`) → MQTT → Raspberry Pi receives command, simulates relay action
4. Frontend → HTTPS → API Gateway → Lambda → DynamoDB → Response
5. Cognito Hosted UI → OAuth code → Frontend exchanges code for tokens at `oauth2/token` endpoint

---

## 3. Prototype Implementation

### 3.1 Cloud Backend Implementation

#### 3.1.1 Data Ingestion Channel

Data reaches the cloud through two paths:

**Path A — Device MQTT (Primary)**:
The Raspberry Pi publishes JSON payloads to MQTT topic `dorm/electricity/data`. AWS IoT Core receives the message. An IoT Rule with SQL `SELECT * FROM 'dorm/electricity/data'` triggers `lambda_function.py`.

**Path B — API Gateway (Simulator)**:
The frontend Simulator page sends POST requests to `/simulate`. API Gateway routes this to `SimulateDeviceData.py`, which publishes test data to the same MQTT topic.

Both paths demonstrate the system's flexibility: real devices use MQTT directly, while user-facing tools use REST via API Gateway.

`[INSERT_IMAGE: AWS IoT Core Console — MQTT test client showing incoming messages on topic dorm/electricity/data]`

#### 3.1.2 Data Storage Design

Three DynamoDB tables were chosen for their distinct access patterns:

| Table | Partition Key | Sort Key | Access Pattern | Why DynamoDB |
|-------|--------------|----------|---------------|--------------|
| DormElectricData | deviceId | timestamp | Query by device, sorted by time (newest first) | Time-series data — high write throughput, query by partition key |
| DormSystemSettings | settingId | — | Single-item read/write (the threshold) | Small config table — GetItem/PutItem with low latency |
| DormAlertHistory | alertId | — | Scan with limit (recent alerts) | Event log — infrequent reads, simple structure |

DynamoDB was selected over RDS because:
- IoT data is semi-structured (variable fields possible in future)
- No complex JOIN queries needed — all queries are by primary key
- Auto-scaling handles sudden bursts of device data without provisioning
- Free tier includes 25 GB of storage — sufficient for the prototype

`[INSERT_IMAGE: AWS DynamoDB Console — Show DormElectricData table items with columns visible]`

#### 3.1.3 Data Processing Logic

The core processing Lambda (`lambda_function.py`) implements a multi-step pipeline:

1. **Validation**: Check for required fields (voltage, current, power, cumulative_energy)
2. **Threshold Resolution**: Read current threshold from DormSystemSettings (falls back to 3000W default)
3. **Zero-Reading Guard**: If the device is publishing zero readings (indicating it has already cut power), read the current shadow state. If `power_cutoff = true`, maintain cutoff — do not evaluate overload again. This prevents a rapid on/off cycle.
4. **Overload Evaluation**: For normal readings, compare power against threshold
5. **Persistence**: Convert floats to Decimal (DynamoDB requirement) and write to DormElectricData
6. **Shadow Update**: Write `desired.power_cutoff` to IoT Device Shadow
7. **Alert & Logging**: If overloaded, send SNS email and write to DormAlertHistory
8. **Metrics**: Publish 5 custom metrics to CloudWatch (Power, Current, Voltage, Overload, Threshold)

Exception handling is implemented at every step — each external service call (DynamoDB, IoT, SNS, CloudWatch) is wrapped in try/except with log output, ensuring a failure in one subsystem does not cascade.

`[INSERT_IMAGE: AWS Lambda Console — lambda_function.py code editor or CloudWatch Logs showing successful execution]`

#### 3.1.4 Security and Access Control

| Security Layer | Implementation |
|---------------|---------------|
| Device Authentication | X.509 certificate (TLS 1.2 mutual authentication) registered to IoT Core Thing |
| API Authorization | Cognito Hosted UI OAuth 2.0 authorization code flow — all tokens verified by Cognito |
| IAM Roles | Lambda execution roles with least-privilege policies: `dynamodb:PutItem/GetItem/Query`, `iot:UpdateThingShadow/GetThingShadow`, `sns:Publish`, `cloudwatch:PutMetricData` |
| Data Encryption | TLS 1.2 for all MQTT and HTTPS traffic; DynamoDB server-side encryption at rest |
| CORS | API Gateway configured with `Access-Control-Allow-Origin: *` for development (restrict in production) |

`[INSERT_IMAGE: AWS IAM Console — Lambda execution role policy JSON]`

#### 3.1.5 Data Analytics (Bonus)

CloudWatch custom metrics are published every 30 seconds to namespace `SmartDorm/EnergyMetrics` with five metrics: Power, Current, Voltage, Overload (count), Threshold. A CloudWatch Dashboard with four widgets visualizes these metrics. Additionally, two Metric Math expressions compute overload rate and power headroom.

`[INSERT_IMAGE: AWS CloudWatch Dashboard — All 4-6 widgets visible on one screen]`

### 3.2 Web Frontend Implementation

#### 3.2.1 Real-Time Data Visualization

The Dashboard page fetches data from `GET /data` every 15 seconds and renders:
- **Three Chart.js charts** (single Y-axis each to avoid rendering bugs): Power Trend line chart with threshold reference line, Current bar chart, Voltage area chart
- **Four real-time stat cards**: Power, Current, Voltage, Total Energy — dynamically change color when overload is detected
- **Four analytics cards** (computed client-side): Maximum Power, Average Power, Overload Event Count & Percentage, Power Margin (threshold headroom)
- **Data table**: 20 most recent records with overload status badges

`[INSERT_IMAGE: Dashboard page — Full screen showing charts, stats, analytics cards, and data table]`

#### 3.2.2 Remote Control

Two interactive control features are provided:

**Threshold Management** (Settings page):
- Four preset buttons (1.5kW, 2.0kW, 3.0kW, 5.0kW) for quick selection
- Custom numeric input with validation
- On save: API call to PUT /threshold → Lambda re-evaluates latest data → updates device shadow → shadow delta sent to device → device simulates power cutoff if overloaded
- Red warning banner with "Power Cutoff Triggered" message displays if cutoff was activated
- Step-by-step flow diagram explaining the cutoff mechanism

**Device Simulator** (Simulator page):
- Quick scenario buttons: Normal Load (800W), Mild Overload (3500W), Heavy Overload (5500W)
- Custom parameter mode toggle: "By Power" or "By Current + Voltage"
- All inputs accept arbitrary decimal values (no step constraints)
- Result display shows the exact published values

`[INSERT_IMAGE: Settings page — Showing overload warning banner and power cutoff flow diagram]`

#### 3.2.3 Authentication

Cognito Hosted UI provides the complete OAuth 2.0 flow:
1. User clicks "Sign In with AWS Cognito" on LandingPage
2. Browser redirects to Cognito login page (`/login?client_id=...&redirect_uri=...`)
3. Cognito handles: email/password validation, FORCE_CHANGE_PASSWORD flow, MFA (if configured)
4. After successful login, Cognito redirects to `http://localhost:5173?code=xxxx`
5. Frontend detects `?code=` in URL, exchanges it for tokens via POST to `/oauth2/token`
6. Tokens (id_token, access_token, refresh_token) stored in localStorage
7. Auto-refresh when token nears expiry; redirect to Cognito /logout on sign-out

Zero AWS SDK dependencies — all OAuth interactions use native `fetch()`.

`[INSERT_IMAGE: Cognito Hosted UI login page in browser]`

`[INSERT_IMAGE: LandingPage with "Sign In with AWS Cognito" button]`

#### 3.2.4 Alert Notification (Bonus)

**SNS Email Alerts**: When an overload is detected, the Lambda sends an SNS email containing device ID, timestamp, voltage, current, power, threshold, and cumulative energy. The Lambda also logs the event to DormAlertHistory table.

**Alert History Page**: A dedicated page queries `GET /alerts` and displays all overload events in a table with columns: Time, Power, Threshold, Excess amount, Current, Voltage.

**Dashboard Overload Banner**: A red pulsing banner with warning icon and power details appears at the top of the Dashboard when the latest reading exceeds the threshold.

`[INSERT_IMAGE: Alert History page — Table with overload records visible]`

`[INSERT_IMAGE: Email inbox showing SNS overload alert email]`

### 3.3 Code Quality

All source code follows these practices:
- **Module separation**: config.js, api.js, auth.js are independently testable modules
- **JSDoc comments**: Every file has a header block explaining its role and design decisions
- **Defensive coding**: All data access uses optional chaining (`?.`) and nullish coalescing (`??`)
- **Error boundaries**: React ErrorBoundary wrapping every page ensures no blank screens
- **Static imports**: No dynamic `import()` to prevent Vite module-fetch failures
- **Single-axis charts**: Each Chart.js chart uses one Y-axis to avoid rendering conflicts

---

## 4. Cloud Integration Value Analysis

This section analyzes how cloud services provide unique advantages over a traditional local-deployment approach.

### 4.1 Elastic Scalability

**Without cloud**: Adding 100 more dormitory rooms would require provisioning new servers, expanding local databases, and configuring load balancers — a process taking days and requiring upfront hardware investment.

**With AWS cloud**: DynamoDB's on-demand capacity mode automatically scales read/write throughput as data volume grows. IoT Core handles millions of concurrent device connections without configuration changes. Lambda scales from zero to thousands of concurrent function instances instantly — no server provisioning needed. Adding 100 rooms is transparent to the architecture.

### 4.2 Serverless Computing

All backend logic runs on AWS Lambda with zero server management. The Lambda functions:
- Scale down to zero when idle (no cost for unused capacity)
- Automatically scale up during peak usage (e.g., all rooms reporting simultaneously)
- Charge only for actual execution time (first 1 million requests per month are free)

This contrasts with traditional EC2-based solutions where a server must run 24/7 regardless of utilization, incurring costs even during idle periods.

### 4.3 Cost Efficiency

| Resource | Monthly Cost (Prototype) | Monthly Cost (100-Room Campus) |
|----------|--------------------------|-------------------------------|
| IoT Core | Free tier: 2.25M messages/month | ~$2-5/month for additional messages |
| Lambda | Free tier: 1M requests, 400K GB-seconds | ~$5-10/month for compute |
| DynamoDB | Free tier: 25 GB storage | ~$3-5/month for additional storage + throughput |
| Cognito | Free tier: 50K MAU | Remains free under 50K users |
| API Gateway | Free tier: 1M requests/month | ~$3-5/month for additional requests |
| SNS | Free tier: 1K email notifications | ~$2/month for additional emails |
| CloudWatch | Free tier: 10 custom metrics | ~$5-10/month for dashboard + additional metrics |
| **Total** | **$0/month** | **~$20-37/month** |

A traditional hosted solution (EC2 t3.medium 24/7) would cost approximately $30/month even for the prototype, plus RDS costs ($15+/month). The serverless approach is cost-free during development and scales linearly with usage.

### 4.4 High Availability and Reliability

- DynamoDB replicates data across three availability zones automatically
- Lambda functions are inherently fault-tolerant — AWS routes around failed instances
- IoT Core maintains persistent MQTT connections with automatic reconnection
- Cognito ensures authentication availability without hosting an auth server
- SNS guarantee message delivery with retry logic

### 4.5 Built-in Analytics

CloudWatch custom metrics and dashboards provide analytics capabilities without deploying additional tools like Grafana or QuickSight. The data retention policy (15 months for custom metrics) enables long-term trend analysis at no extra cost.

---

## 5. Source Code Analysis

### 5.1 OAuth Authentication Flow

The authentication module ([src/auth.js](dorm-energy-frontend/src/auth.js)) implements Cognito Hosted UI OAuth with zero dependencies:

```
User clicks Sign In → redirect to Cognito /login
  → Cognito handles login + FORCE_CHANGE_PASSWORD
  → redirect back with ?code=
  → exchangeCodeForTokens(code):
      POST https://domain/oauth2/token
      Body: grant_type=authorization_code, client_id, code, redirect_uri
      Response: id_token, access_token, refresh_token
  → Store tokens in localStorage
  → Parse JWT to extract user identity (email)
```

Key design decision: Using the authorization code flow (not implicit) means tokens are never exposed in the URL — they are fetched via a secure POST exchange.

### 5.2 Zero-Reading Guard (Overload Cycle Prevention)

The data processing Lambda ([Lambda/lambda_function.py](Lambda/lambda_function.py)) implements a zero-reading guard that prevents the following cycle:

```
High power → overload → cutoff → device publishes 0W
  → Lambda sees 0W < threshold → sets cutoff=false
  → device restores → power still high → overload → cutoff again
  (infinite rapid on/off cycle)
```

The guard detects `voltage < 1 && current < 1 && power < 1` (device in cutoff), reads the current shadow state, and if `power_cutoff = true`, maintains the cutoff without re-evaluating overload. Cutoff is only lifted when the user manually raises the threshold via the web UI.

### 5.3 Device Shadow Ownership Separation

A key architectural decision was to separate shadow section ownership:
- **Lambda writes ONLY to `desired`** (the command)
- **Device writes ONLY to `reported`** (the confirmation)

If the Lambda also wrote to `reported`, it would overwrite the device's confirmation, breaking shadow delta delivery. This separation ensures clean delta calculation by IoT Core.

---

## 6. Deployment Guide

### 6.1 Prerequisites

- AWS account with Administrator access
- Node.js 18+ and npm
- Python 3.9+ and pip

### 6.2 AWS Resources Deployment Order

1. **DynamoDB Tables**: Create using AWS Console or let Lambda auto-create on first invocation
2. **IAM Role**: Create a role for Lambda with policies for DynamoDB, IoT Core, SNS, CloudWatch
3. **Lambda Functions**: Deploy each `.py` file from the `Lambda/` directory in AWS Console
4. **IoT Core**: Create Thing `DormRaspberryPi`, generate certificates, attach IoT policy with shadow permissions
5. **API Gateway**: Create REST API with four routes, enable CORS, deploy to `/dev` stage
6. **Cognito**: Create User Pool, configure Hosted UI with callback URL `http://localhost:5173`
7. **SNS**: Create topic `DormEnergyAlerts`, add email subscription

### 6.3 Local Frontend Setup

```bash
cd dorm-energy-frontend
npm install
npm run dev
```

### 6.4 Device Simulator Setup

```bash
cd app
pip install paho-mqtt
# Copy certificate files to the same directory
python aws_iot_publisher.py
```

---

## 7. Troubleshooting Guide

| Symptom | Probable Cause | Solution |
|---------|---------------|----------|
| Frontend blank page | Vite module cache corruption | `rm -rf node_modules/.vite && npm run dev` |
| "Invalid request" on Cognito Login | Callback URL not registered in App Client | Add `http://localhost:5173` to Allowed Callback URLs in Cognito Console |
| Device does not receive shadow delta | Named shadow topic path incorrect | Verify MQTT topic uses `/shadow/name/dorm_energy_shadow/` segment, not just `/shadow/` |
| "Failed to publish CloudWatch metrics" in Lambda logs | IAM role missing `cloudwatch:PutMetricData` | Add inline IAM policy with PutMetricData permission |
| "Failed to update device shadow" in Lambda logs | IAM role missing `iot:UpdateThingShadow` | Add inline IAM policy with UpdateThingShadow permission |
| CloudWatch metrics not appearing in Dashboard | Unit value was invalid (Watts/Amps/Volts) | Ensure Lambda code uses `Unit: 'None'` — deploy latest code |
| Simulator shows random values instead of input | Lambda doesn't read current/voltage from request | Deploy latest SimulateDeviceData.py that handles `custom_current` and `custom_voltage` |
| MQTT connection refused | Certificate path wrong or certificate not registered | Verify file paths in aws_iot_publisher.py; check IoT Core Thing certificate status |
| Dashboard threshold line not updating | Threshold not synced to localStorage | Ensure latest Settings.jsx code is deployed (calls `localStorage.setItem`) |

---

## 8. User Manual

### 8.1 Logging In

1. Open `http://localhost:5173` in a browser
2. Click "Sign In with AWS Cognito"
3. Enter your email and password on the Cognito login page
4. If this is your first login, Cognito will prompt you to set a new password
5. After successful login, you will be redirected to the Dashboard

### 8.2 Viewing Real-Time Data

The Dashboard displays:
- **Top cards**: Current power, current, voltage, cumulative energy
- **Analytics**: Max power, average power, overload count, power margin
- **Charts**: Power trend (with red threshold line), current bar chart, voltage curve
- **Table**: Most recent 20 readings with overload status

Data refreshes automatically every 15 seconds.

### 8.3 Testing Overload Detection

1. Navigate to **Simulator**
2. Click "Mild Overload" (3500W) to send a data point above the default 3000W threshold
3. Return to Dashboard — a red overload banner should appear
4. Check email for SNS overload notification

### 8.4 Changing the Threshold

1. Navigate to **Settings**
2. Click a preset button or enter a custom watt value
3. Click "Save"
4. If the current power exceeds the new threshold, a red "Power Cutoff Triggered" banner appears and the device will be commanded to cut power

### 8.5 Viewing Alert History

Navigate to **Alert History** to see all past overload events with timestamps, power values, and excess amounts.

### 8.6 Logging Out

Click the user icon in the top-right corner → "Sign Out". This clears your local session and signs you out of Cognito.

---

## 9. AI Tool Usage Declaration

In accordance with the course requirement, the following generative AI tools were used in this project:

| Tool | Usage | Scope |
|------|-------|-------|
| Claude (Anthropic) | Code generation for Lambda functions, React frontend components, device-side scripts; debugging MQTT shadow topic paths; fixing Vite module compatibility; generating README and architecture diagrams | Full-stack development assistance |
| Claude (Anthropic) | Report drafting — generating Section 2–9 content based on project code and architecture | Report writing assistance |

All AI-generated code was reviewed, tested, and modified as needed. The student takes full responsibility for the final submission.

---

`[INSERT_IMAGE: Full system running — Side-by-side showing (1) device simulator terminal, (2) web dashboard, (3) CloudWatch dashboard, (4) Cognito login page]`
