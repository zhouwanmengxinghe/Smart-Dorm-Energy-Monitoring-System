# 智能宿舍用电监测系统

[English](README.md) | 简体中文

一个集成物联网与云服务的宿舍用电监测方案，支持实时用电监测、过载检测和自动断电控制。系统基于 AWS IoT Core、Lambda、DynamoDB、Cognito 和 API Gateway 构建，并提供 React Web 仪表盘。

> 实现说明：仓库中的设备端使用模拟传感器数据，通过状态标志模拟继电器断电，并非真实市电控制设备。以下云端访问方式取决于项目所有者的服务配置及可用性。

## 系统架构

```text
第一层：设备端（Raspberry Pi）
  aws_iot_publisher.py
  - 每 30 秒通过 MQTT 发布模拟传感器数据
  - 订阅设备影子 delta，接收 power_cutoff 指令
  - 检测到过载后模拟继电器断电

第二层：云端（AWS）
  - IoT Core：MQTT 消息代理、命名设备影子 dorm_energy_shadow
  - Lambda：5 个无服务器函数，处理数据和 API 请求
  - DynamoDB：DormElectricData、DormSystemSettings、DormAlertHistory
  - API Gateway：/data、/threshold、/simulate、/alerts 四个 REST 端点
  - Cognito：Hosted UI OAuth 2.0 登录，支持首次登录强制修改密码
  - SNS：向宿舍管理人员发送过载邮件提醒
  - CloudWatch：SmartDorm/EnergyMetrics 自定义指标与仪表盘

第三层：前端（浏览器）
  React 18 + Vite + Tailwind CSS
  页面：欢迎页、仪表盘、模拟器、告警历史、设置

数据流：设备 -> MQTT -> IoT Core -> Lambda -> DynamoDB + SNS + CloudWatch
Web 流程：浏览器 -> Cognito 登录 -> API Gateway -> Lambda -> DynamoDB
```

## 项目文件

```text
Smart-Dorm-Energy-Monitoring-System/
  README.md                         英文说明
  README.zh-CN.md                    中文说明
  Lambda/
    lambda_function.py              核心数据处理
    GetElectricityData.py           GET /data
    UpdateAlertThreshold.py         PUT /threshold 与设备影子更新
    SimulateDeviceData.py           POST /simulate
    GetAlertHistory.py              GET /alerts
  app/
    aws_iot_publisher.py            设备模拟器（MQTT 与设备影子）
  dorm-energy-frontend/
    index.html
    package.json
    vite.config.js
    tailwind.config.js
    postcss.config.js
    src/
      main.jsx                      入口
      App.jsx                       根组件与登录检查
      config.js                     API 与 Cognito 配置
      api.js                        Axios 封装
      auth.js                       Cognito OAuth 授权码流程
      index.css
      components/
        ErrorBoundary.jsx           捕获渲染错误
        LandingPage.jsx             欢迎页与登录按钮
        Header.jsx                  顶栏、用户菜单和退出登录
        Sidebar.jsx                 桌面端导航
        MobileNav.jsx               移动端底部导航
        Dashboard.jsx               图表、统计和分析
        Simulator.jsx               自定义遥测测试
        Alerts.jsx                  过载历史表格
        Settings.jsx                阈值与断电流程设置
  docs/
    architecture-diagram.md         Mermaid 架构图
    report-continuation.md          报告第 2–9 章
  reference/                        参考论文
```

## 技术栈

| 层次 | 技术 |
| --- | --- |
| 设备 | Python、paho-mqtt，负责 MQTT 发布和影子订阅 |
| 通信 | MQTT，TLS 1.2，8883 端口 |
| API | AWS API Gateway REST API，4 个端点 |
| 计算 | AWS Lambda，无服务器 Python 函数；英文部署说明指定 Python 3.14 |
| 存储 | AWS DynamoDB，3 张 NoSQL 表 |
| 认证 | AWS Cognito Hosted UI，OAuth 2.0 授权码模式 |
| 消息通知 | AWS SNS 过载邮件提醒 |
| 监控 | AWS CloudWatch 自定义指标与仪表盘 |
| 设备管理 | AWS IoT Core MQTT 消息代理与命名设备影子 |
| 前端 | React 18、Vite、Tailwind CSS、Chart.js、Axios |

## 如何访问系统

使用项目所有者提供的云端环境时，需要：

- 本地运行前端后访问 [http://localhost:5173](http://localhost:5173)。
- 项目所有者创建的有效 Cognito 用户账号。

按英文说明，前端已指向项目所有者的 AWS 后端，体验者不需要自行准备 AWS 账号、API 密钥、数据库或后端配置。登录后可访问仪表盘、模拟器、告警历史和设置页面。该方式要求原云端环境仍在运行；独立部署则需自行配置以下资源。

## 快速开始

### 环境要求

- Node.js 18+ 与 npm。
- Python 与 pip；英文说明指定 Python 3.14+，请结合实际部署环境确认版本。
- 独立部署需要 AWS 账号，以及 Cognito 用户池、IoT Core Thing 与证书、已部署的 Lambda、API Gateway 路由和 IAM 角色。

### 前端

```bash
cd dorm-energy-frontend
npm install
npm run dev
# 默认本地地址：http://localhost:5173
npm run build
# 构建输出：dist/
```

### 设备模拟器

先在 `app/aws_iot_publisher.py` 中配置自己的 IoT 端点和证书路径，然后运行：

```bash
cd app
pip install paho-mqtt
python aws_iot_publisher.py
```

### Lambda 函数与 IAM 权限

每个 Lambda 都需要 IAM 角色，可以分别配置，也可以使用共享角色。英文原文列出的 AWS 托管策略如下。

> 安全提示：这些 `FullAccess` 策略适合理解原课程演示配置，但权限范围较宽。实际部署应按具体表、主题和设备资源限制操作权限，不要公开证书或私钥。

| 函数 | 英文说明列出的策略 | 用途 |
| --- | --- | --- |
| 所有函数 | `AWSLambdaBasicExecutionRole` | 写入 CloudWatch Logs |
| `lambda_function.py` | 基础策略、`AmazonDynamoDBFullAccess`、`AWSIoTDataAccess`、`AmazonSNSFullAccess`、`CloudWatchFullAccess` | 读取设置、保存遥测和告警、读写设备影子、发送邮件、发布指标 |
| `GetElectricityData.py` | 基础策略、`AmazonDynamoDBFullAccess` | 查询 DormElectricData |
| `UpdateAlertThreshold.py` | 基础策略、`AmazonDynamoDBFullAccess`、`AWSIoTDataAccess`、`AmazonSNSFullAccess` | 保存阈值、查询读数、更新影子并记录与发送告警 |
| `SimulateDeviceData.py` | 基础策略、`AWSIoTDataAccess` | 向 IoT Core 发布模拟 MQTT 数据 |
| `GetAlertHistory.py` | 基础策略、`AmazonDynamoDBFullAccess` | 扫描 DormAlertHistory |

在 AWS 控制台关联策略：

1. 打开 IAM → Roles → Create role。
2. 选择 Lambda 作为受信任实体。
3. 搜索并选择所需策略，例如 `AWSLambdaBasicExecutionRole`。
4. 为角色命名，例如 `DormEnergy-MainProcessor-Role`。
5. 在 Lambda → Configuration → Permissions 中关联该角色。

英文说明中的 Lambda 通用配置：Python 3.14 运行时、x86_64 架构、30 秒超时。

### Cognito Hosted UI 配置

在 AWS 控制台的 Cognito 应用客户端中配置：

- 允许的回调地址：`http://localhost:5173`。
- 允许的退出登录地址：`http://localhost:5173`。
- OAuth 授权类型：Authorization code grant。
- OAuth scopes：`email`、`openid`、`phone`。

## API 参考

英文原文的基础地址为 `https://n9lxkwwoch.execute-api.ap-southeast-2.amazonaws.com/dev`。独立部署时请替换为自己的 API Gateway 地址。

| 方法 | 路径与参数 | 功能 |
| --- | --- | --- |
| GET | `/data?limit=100` | 获取最近用电读数 |
| PUT | `/threshold`，请求体 `{threshold}` | 更新过载阈值 |
| POST | `/simulate`，请求体 `{power}` 或 `{current,voltage}` | 发布测试数据 |
| GET | `/alerts?limit=50` | 获取过载事件历史 |

## DynamoDB 数据表

| 表 | 分区键 | 排序键 | 内容 |
| --- | --- | --- | --- |
| `DormElectricData` | `deviceId` | `timestamp` | 传感器读数 |
| `DormSystemSettings` | `settingId` | — | `overload_threshold` 设置 |
| `DormAlertHistory` | `alertId` | — | 过载事件 |

## MQTT 主题

```text
dorm/electricity/data
  设备 -> 云端：遥测数据

$aws/things/DormRaspberryPi/shadow/name/dorm_energy_shadow/update/delta
  云端 -> 设备：断电指令

$aws/things/DormRaspberryPi/shadow/name/dorm_energy_shadow/update
  设备 -> 云端：执行状态确认
```

## 核心功能

- **仪表盘**：功率、电流、电压图表，统计卡片、分析栏、数据表，15 秒自动刷新与过载红色提示。
- **过载检测**：可配置阈值、SNS 邮件提醒和设备影子断电指令。
- **断电流程**：Web 修改阈值 → Lambda → Device Shadow → Raspberry Pi 模拟继电器动作。
- **模拟器**：手动注入遥测数据，提供 3 种快捷场景和自定义参数。
- **云端分析**：CloudWatch `SmartDorm/EnergyMetrics` 自定义指标与仪表盘。
- **认证**：Cognito Hosted UI OAuth，无需在前端使用认证 SDK，支持首次登录强制修改密码。
- **响应式界面**：桌面侧边栏和移动端底部导航。
- **错误边界**：捕获组件渲染错误，提供重新加载提示。

## 故障排查

| 问题 | 排查方法 |
| --- | --- |
| localhost 空白页 | 清理前端 `node_modules/.vite` 缓存后重新运行 `npm run dev` |
| Cognito 登录显示 Invalid request | 检查允许的回调地址中是否包含 `http://localhost:5173` |
| 退出登录显示 Invalid request | 检查允许的退出地址中是否包含 `http://localhost:5173` |
| MQTT 连接失败 | 检查设备脚本中的 `CA_FILE`、`CERT_FILE`、`KEY_FILE` 路径 |
| 设备未收到影子 delta | 确认主题包含 `/name/dorm_energy_shadow/`，使用的是命名影子 |
| CloudWatch 指标未出现 | 检查 Lambda IAM 角色是否具有 `cloudwatch:PutMetricData` 权限 |
| 模拟器显示随机值而非输入值 | 部署支持 current/voltage 参数的最新版 `SimulateDeviceData.py` |
| 仪表盘阈值线不更新 | 更新 `Settings.jsx`，确认保存时执行 `localStorage.setItem` |

## 许可说明

学术项目：Smart Dorm EnergyGuard，2026。英文原文未在此指定标准开源许可证。
