import json
import boto3
from decimal import Decimal
from datetime import datetime
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
iot_client = boto3.client('iot-data', region_name='ap-southeast-2')
sns_client = boto3.client('sns', region_name='ap-southeast-2')

SETTINGS_TABLE_NAME = 'DormSystemSettings'
DATA_TABLE_NAME = 'DormElectricData'
ALERT_TABLE_NAME = 'DormAlertHistory'

settings_table = dynamodb.Table(SETTINGS_TABLE_NAME)
data_table = dynamodb.Table(DATA_TABLE_NAME)
alert_table = dynamodb.Table(ALERT_TABLE_NAME)

SNS_TOPIC_ARN = "arn:aws:sns:ap-southeast-2:225619512628:DormEnergyAlerts"
THING_NAME = 'DormRaspberryPi'
SHADOW_NAME = 'dorm_energy_shadow'


def convert_floats_to_decimals(obj):
    """Recursively convert all floats to Decimal for DynamoDB compatibility."""
    if isinstance(obj, dict):
        return {k: convert_floats_to_decimals(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_floats_to_decimals(v) for v in obj]
    elif isinstance(obj, float):
        return Decimal(str(obj))
    else:
        return obj


def get_latest_data():
    """
    Fetch the single most recent reading from DormElectricData.
    Returns None if the table is empty.
    """
    response = data_table.query(
        KeyConditionExpression=Key('deviceId').eq(THING_NAME),
        ScanIndexForward=False,  # descending by timestamp
        Limit=1
    )
    items = response.get('Items', [])
    return items[0] if items else None


def update_device_shadow(is_overload):
    """
    Publish a power_cutoff command to the IoT device shadow.

    Only the "desired" section is written.  The "reported" section is
    owned by the device — it confirms execution by publishing its own
    state after acting on the desired delta.
    """
    try:
        shadow_payload = {
            "state": {
                "desired": {
                    "power_cutoff": "true" if is_overload else "false"
                }
            }
        }
        iot_client.update_thing_shadow(
            thingName=THING_NAME,
            shadowName=SHADOW_NAME,
            payload=json.dumps(shadow_payload)
        )
        print(f"Shadow updated — power_cutoff={'true' if is_overload else 'false'}")
    except Exception as e:
        print(f"Failed to update device shadow: {e}")


def send_overload_alert(item):
    """Send SNS email notification for an overload event."""
    try:
        subject = f"[SmartDorm EnergyGuard] Overload Alert - {item['power']}W detected"
        message = (
            f"OVERLOAD DETECTED (threshold change)\n"
            f"----------------------------------------\n"
            f"Device: {item['deviceId']}\n"
            f"Timestamp: {item['timestamp']}\n"
            f"Voltage: {item['voltage']}V\n"
            f"Current: {item['current']}A\n"
            f"Power: {item['power']}W\n"
            f"Threshold: {item['threshold']}W\n"
            f"Cumulative Energy: {item['cumulative_energy']}kWh\n"
            f"\nThe device shadow has been set to power_cutoff=true.\n"
            f"The dorm power should be disconnected."
        )
        sns_client.publish(
            TopicArn=SNS_TOPIC_ARN,
            Subject=subject,
            Message=message
        )
        print("Overload alert email sent via SNS")
    except Exception as e:
        print(f"Failed to send SNS alert: {e}")


def log_alert_to_history(item):
    """Write an overload event to DormAlertHistory table."""
    try:
        alert_id = f"alert_{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"
        alert_item = {
            'alertId': alert_id,
            'timestamp': item['timestamp'],
            'deviceId': item['deviceId'],
            'power': item['power'],
            'voltage': item['voltage'],
            'current': item['current'],
            'threshold': item['threshold'],
            'type': 'overload'
        }
        alert_item = convert_floats_to_decimals(alert_item)
        alert_table.put_item(Item=alert_item)
        print(f"Alert logged to history: {alert_id}")
    except Exception as e:
        print(f"Failed to log alert: {e}")


def lambda_handler(event, context):
    try:
        body = json.loads(event.get('body', '{}'))
        threshold = body.get('threshold')

        # ── Validation ──────────────────────────────────────────
        if threshold is None:
            return {
                'statusCode': 400,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'PUT,OPTIONS'
                },
                'body': json.dumps({
                    'success': False,
                    'error': 'Missing required field: threshold'
                })
            }

        threshold = float(threshold)
        if threshold <= 0:
            return {
                'statusCode': 400,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'PUT,OPTIONS'
                },
                'body': json.dumps({
                    'success': False,
                    'error': 'Threshold must be greater than 0'
                })
            }

        # ── Persist threshold ───────────────────────────────────
        settings_table.put_item(Item={
            'settingId': 'overload_threshold',
            'value': Decimal(str(threshold))
        })
        print(f"Overload threshold saved: {threshold}W")

        # ── Re-evaluate latest reading against new threshold ────
        latest = get_latest_data()
        is_overload = False

        if latest:
            current_power = float(latest.get('power', 0))
            current_voltage = float(latest.get('voltage', 0))
            current_current = float(latest.get('current', 0))
            cumulative_energy = float(latest.get('cumulative_energy', 0))
            timestamp = latest.get('timestamp', datetime.utcnow().isoformat() + 'Z')

            is_overload = current_power > threshold

            # Push shadow update so the device can act on the new threshold
            update_device_shadow(is_overload)

            # If the threshold change causes a *new* overload, send alert + log
            if is_overload:
                alert_item = {
                    'deviceId': THING_NAME,
                    'timestamp': timestamp,
                    'voltage': current_voltage,
                    'current': current_current,
                    'power': current_power,
                    'cumulative_energy': cumulative_energy,
                    'threshold': threshold
                }
                send_overload_alert(alert_item)
                log_alert_to_history(alert_item)
        else:
            print("No data in DormElectricData — skipping shadow update")

        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'PUT,OPTIONS'
            },
            'body': json.dumps({
                'success': True,
                'message': f'Threshold updated to {threshold}W',
                'threshold': threshold,
                'is_overload': is_overload,
                'current_power': float(latest.get('power', 0)) if latest else None
            })
        }

    except Exception as e:
        print(f"Error updating threshold: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'PUT,OPTIONS'
            },
            'body': json.dumps({'error': str(e)})
        }
