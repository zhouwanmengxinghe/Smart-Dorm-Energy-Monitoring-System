import paho.mqtt.client as mqtt
import ssl
import json
import time
import random

# ====================== 你已经填对的端点 ======================
AWS_IOT_ENDPOINT = "a39kbv9e3eocr6-ats.iot.ap-southeast-2.amazonaws.com"
# ==============================================================

# ====================== 我帮你改好的证书名称 ======================
MQTT_TOPIC = "dorm/electricity/data"
CLIENT_ID = "DormRaspberryPi"

# 你的真实证书文件名（完全匹配你给的）
CA_FILE = "AmazonRootCA1.pem"
CERT_FILE = "0f8e11dc7ac80bdd343891acb47d25d8a57b44e79950a5852a7f77dfb16d2797-certificate.pem.crt"
KEY_FILE = "0f8e11dc7ac80bdd343891acb47d25d8a57b44e79950a5852a7f77dfb16d2797-private.pem.key"
# =================================================================

# 模拟累计用电量初始值
cumulative_energy = 0.0

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("✅ 成功连接到 AWS IoT Core")
        print("🚀 开始每30秒上传模拟数据")
        print("按 Ctrl+C 停止\n")
    else:
        print(f"❌ 连接失败，错误码: {rc}")

def on_publish(client, userdata, mid):
    print(f"📤 消息发布成功，ID: {mid}")

# 创建客户端
client = mqtt.Client(client_id=CLIENT_ID)
client.on_connect = on_connect
client.on_publish = on_publish

# TLS 配置
client.tls_set(
    ca_certs=CA_FILE,
    certfile=CERT_FILE,
    keyfile=KEY_FILE,
    tls_version=ssl.PROTOCOL_TLSv1_2
)

# 连接 AWS
try:
    client.connect(AWS_IOT_ENDPOINT, port=8883, keepalive=60)
    client.loop_start()
except Exception as e:
    print(f"❌ 连接失败: {e}")
    exit(1)

# 循环上传数据
try:
    while True:
        voltage = round(random.uniform(228.0, 232.0), 1)
        current = round(random.uniform(0.5, 4.5), 2)
        power = round(voltage * current, 2)
        cumulative_energy += round(power * 30 / 3600000, 4)

        payload = {
            "voltage": voltage,
            "current": current,
            "power": power,
            "cumulative_energy": cumulative_energy
        }

        client.publish(MQTT_TOPIC, json.dumps(payload), qos=1)
        print(f"📊 上传：{voltage}V | {current}A | {power}W | {cumulative_energy:.4f}kWh")

        time.sleep(30)

except KeyboardInterrupt:
    print("\n🛑 停止上传")
    client.loop_stop()
    client.disconnect()