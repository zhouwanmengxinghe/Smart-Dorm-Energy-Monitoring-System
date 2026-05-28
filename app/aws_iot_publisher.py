"""
aws_iot_publisher.py — Raspberry Pi device simulator with shadow-driven power cutoff.

This script does two things concurrently:
  1. Publishes simulated electricity data to dorm/electricity/data every 30 s.
  2. Subscribes to the IoT device shadow delta topic. When the web dashboard
     sets desired.power_cutoff = "true" (because the threshold was exceeded),
     this script detects the delta, simulates cutting dorm power, and reports
     the new state back to the shadow.

No real relay is required — the "cutoff" is simulated via a global flag that
zeroes out published power readings until the shadow restores power.

Prerequisites:
  pip install paho-mqtt

Usage:
  python aws_iot_publisher.py
"""

import paho.mqtt.client as mqtt
import ssl
import json
import time
import random
from datetime import datetime, timezone

# ── AWS IoT configuration ────────────────────────────────────
AWS_IOT_ENDPOINT = "a39kbv9e3eocr6-ats.iot.ap-southeast-2.amazonaws.com"
MQTT_TOPIC = "dorm/electricity/data"
THING_NAME = "DormRaspberryPi"
SHADOW_NAME = "dorm_energy_shadow"
CLIENT_ID = "DormRaspberryPi"

# Shadow MQTT topics
SHADOW_DELTA_TOPIC = f"$aws/things/{THING_NAME}/shadow/update/delta"
SHADOW_UPDATE_TOPIC = f"$aws/things/{THING_NAME}/shadow/update"
SHADOW_GET_TOPIC = f"$aws/things/{THING_NAME}/shadow/get"
SHADOW_GET_ACCEPTED = f"$aws/things/{THING_NAME}/shadow/get/accepted"

# Certificate files (must be in the same directory)
CA_FILE = "AmazonRootCA1.pem"
CERT_FILE = "0f8e11dc7ac80bdd343891acb47d25d8a57b44e79950a5852a7f77dfb16d2797-certificate.pem.crt"
KEY_FILE = "0f8e11dc7ac80bdd343891acb47d25d8a57b44e79950a5852a7f77dfb16d2797-private.pem.key"

# ── Global state ─────────────────────────────────────────────
power_cutoff = False     # True when the shadow commands a power cut
cumulative_energy = 0.0  # simulated kWh accumulator
shadow_version = 0       # latest shadow version for optimistic locking


# ═══════════════════════════════════════════════════════════════
#  Shadow helpers
# ═══════════════════════════════════════════════════════════════

def report_shadow_state(client, cutoff, reason=""):
    """
    Publish a reported-state update to the device shadow so the cloud
    knows the device has acted on the power_cutoff command.
    """
    global shadow_version
    shadow_version += 1

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    payload = {
        "state": {
            "reported": {
                "power_cutoff": "true" if cutoff else "false",
                "power_status": "disconnected" if cutoff else "connected",
                "last_action": reason,
                "action_timestamp": timestamp
            }
        },
        "version": shadow_version
    }

    client.publish(SHADOW_UPDATE_TOPIC, json.dumps(payload), qos=1)
    print(f"Shadow reported: power_cutoff={'true' if cutoff else 'false'} | {reason}")


def request_shadow_state(client):
    """Ask IoT Core for the current full shadow document."""
    client.publish(SHADOW_GET_TOPIC, "", qos=1)


# ═══════════════════════════════════════════════════════════════
#  MQTT callbacks
# ═══════════════════════════════════════════════════════════════

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("Connected to AWS IoT Core")
        client.subscribe(SHADOW_DELTA_TOPIC, qos=1)
        client.subscribe(SHADOW_GET_ACCEPTED, qos=1)
        print(f"Subscribed to shadow delta: {SHADOW_DELTA_TOPIC}")
        request_shadow_state(client)
    else:
        print(f"Connection failed, rc={rc}")


def on_message(client, userdata, msg):
    global power_cutoff, shadow_version

    try:
        payload = json.loads(msg.payload.decode())

        # ── Shadow delta: cloud wants us to change state ──────────
        if msg.topic == SHADOW_DELTA_TOPIC:
            print(f"\nShadow delta received: {json.dumps(payload, indent=2)}")

            desired = payload.get("state", {})
            cutoff_cmd = desired.get("power_cutoff", "false")

            if cutoff_cmd == "true" and not power_cutoff:
                power_cutoff = True
                print("POWER CUTOFF TRIGGERED - simulating relay disconnect")
                report_shadow_state(client, True, "Power disconnected by overload threshold")

            elif cutoff_cmd == "false" and power_cutoff:
                power_cutoff = False
                print("POWER RESTORED - simulating relay reconnect")
                report_shadow_state(client, False, "Power restored - threshold no longer exceeded")

            else:
                print(f"Shadow delta already in sync (power_cutoff={power_cutoff})")
                report_shadow_state(client, power_cutoff, "State already in sync")

        # ── Full shadow doc (startup sync) ───────────────────────
        elif msg.topic == SHADOW_GET_ACCEPTED:
            state = payload.get("state", {})
            reported = state.get("reported", {})
            desired = state.get("desired", {})

            shadow_version = payload.get("version", 0)

            desired_cutoff = desired.get("power_cutoff", "false")
            reported_cutoff = reported.get("power_cutoff", "false")

            if desired_cutoff != reported_cutoff:
                print(f"\nShadow out of sync on startup: desired={desired_cutoff}, reported={reported_cutoff}")
                power_cutoff = (desired_cutoff == "true")
                if power_cutoff:
                    print("Restoring cutoff state: POWER IS CUT")
                report_shadow_state(client, power_cutoff, "State synchronised on startup")
            else:
                power_cutoff = (reported_cutoff == "true")
                print(f"\nShadow in sync: power_cutoff={power_cutoff}")

    except json.JSONDecodeError:
        print(f"Non-JSON message on {msg.topic}: {msg.payload.decode()}")
    except Exception as e:
        print(f"Error handling message: {e}")


def on_publish(client, userdata, mid):
    pass


# ═══════════════════════════════════════════════════════════════
#  Data publisher (runs in the main loop)
# ═══════════════════════════════════════════════════════════════

def publish_sensor_data(client):
    """
    Generate and publish simulated electricity readings.
    When power_cutoff is True, publish zeroed-out readings to reflect
    that power has been physically disconnected.
    """
    global cumulative_energy

    if power_cutoff:
        voltage = 0.0
        current = 0.0
        power = 0.0
    else:
        voltage = round(random.uniform(228.0, 232.0), 1)
        current = round(random.uniform(0.5, 4.5), 2)
        power = round(voltage * current, 2)
        cumulative_energy += round(power * 30 / 3600000, 4)

    payload = {
        "voltage": voltage,
        "current": current,
        "power": power,
        "cumulative_energy": round(cumulative_energy, 4)
    }

    client.publish(MQTT_TOPIC, json.dumps(payload), qos=1)

    status = "[CUTOFF]" if power_cutoff else "[LIVE]"
    print(f"{status}  {voltage}V | {current}A | {power}W | {cumulative_energy:.4f}kWh")


# ═══════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════

def main():
    print("=" * 50)
    print("  Smart Dorm EnergyGuard - Device Simulator")
    print("  Shadow-driven power cutoff enabled")
    print("=" * 50)

    client = mqtt.Client(client_id=CLIENT_ID)
    client.on_connect = on_connect
    client.on_message = on_message
    client.on_publish = on_publish

    client.tls_set(
        ca_certs=CA_FILE,
        certfile=CERT_FILE,
        keyfile=KEY_FILE,
        tls_version=ssl.PROTOCOL_TLSv1_2
    )

    try:
        client.connect(AWS_IOT_ENDPOINT, port=8883, keepalive=60)
        client.loop_start()
    except Exception as e:
        print(f"Connection failed: {e}")
        return

    time.sleep(2)

    print("\nPublishing simulated data every 30s")
    print("Waiting for shadow power_cutoff commands...")
    print("Press Ctrl+C to stop\n")

    try:
        while True:
            publish_sensor_data(client)
            time.sleep(30)

    except KeyboardInterrupt:
        print("\nShutting down")
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
