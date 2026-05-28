import json
import boto3
import os
from datetime import datetime
from decimal import Decimal

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
iot_client = boto3.client('iot-data', region_name='ap-southeast-2')
sns_client = boto3.client('sns', region_name='ap-southeast-2')

# DynamoDB table names
DATA_TABLE_NAME = 'DormElectricData'
SETTINGS_TABLE_NAME = 'DormSystemSettings'
ALERT_TABLE_NAME = 'DormAlertHistory'

data_table = dynamodb.Table(DATA_TABLE_NAME)
settings_table = dynamodb.Table(SETTINGS_TABLE_NAME)
alert_table = dynamodb.Table(ALERT_TABLE_NAME)

# SNS topic ARN — receives the full ARN from environment or falls back to default
SNS_TOPIC_ARN = os.environ.get(
    'SNS_TOPIC_ARN',
    "arn:aws:sns:ap-southeast-2:225619512628:DormEnergyAlerts"
)

THING_NAME = 'DormRaspberryPi'
SHADOW_NAME = 'dorm_energy_shadow'

# Default overload threshold (3000W) — used if DormSystemSettings has no value
DEFAULT_OVERLOAD_THRESHOLD = 3000


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


def get_overload_threshold():
    """Read the dynamic overload threshold from DormSystemSettings table."""
    try:
        response = settings_table.get_item(Key={'settingId': 'overload_threshold'})
        if 'Item' in response:
            threshold = int(response['Item'].get('value', DEFAULT_OVERLOAD_THRESHOLD))
            print(f"Dynamic threshold loaded: {threshold}W")
            return threshold
        else:
            print(f"No threshold found in settings, using default: {DEFAULT_OVERLOAD_THRESHOLD}W")
            return DEFAULT_OVERLOAD_THRESHOLD
    except Exception as e:
        print(f"Failed to read threshold from settings, using default: {e}")
        return DEFAULT_OVERLOAD_THRESHOLD


def send_overload_alert(item):
    """Send SNS email alert when overload is detected."""
    try:
        subject = f"[SmartDorm EnergyGuard] Overload Alert - {item['power']}W detected"
        message = (
            f"OVERLOAD DETECTED\n"
            f"------------------\n"
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
    """Log overload alert to DormAlertHistory table."""
    try:
        alert_id = f"alert_{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"
        alert_item = {
            'alertId': alert_id,
            'timestamp': item['timestamp'],
            'deviceId': item['deviceId'],
            'power': item['power'],
            'voltage': item['voltage'],
            'current': item['current'],
            'threshold': item.get('threshold', DEFAULT_OVERLOAD_THRESHOLD),
            'type': 'overload'
        }
        alert_item = convert_floats_to_decimals(alert_item)
        alert_table.put_item(Item=alert_item)
        print(f"Alert logged to history: {alert_id}")
    except Exception as e:
        print(f"Failed to log alert: {e}")


def update_device_shadow(power, threshold, is_overload, timestamp):
    """
    Update IoT device shadow with latest readings AND power-cutoff command.

    The shadow has two sections:
      desired  — commands the device should act on (power_cutoff)
      reported — the device's current known state

    When is_overload is True, desired.power_cutoff is set to "true".
    The device (Raspberry Pi) subscribes to shadow delta events and
    should physically cut power when it sees this flag.
    """
    try:
        shadow_payload = {
            "state": {
                "desired": {
                    "power_cutoff": "true" if is_overload else "false"
                },
                "reported": {
                    "current_power": str(round(power, 2)),
                    "threshold": str(round(threshold, 2)),
                    "is_overload": str(is_overload).lower(),
                    "last_update": timestamp
                }
            }
        }
        iot_client.update_thing_shadow(
            thingName=THING_NAME,
            shadowName=SHADOW_NAME,
            payload=json.dumps(shadow_payload)
        )
        print(f"Device shadow updated — power_cutoff={'true' if is_overload else 'false'}")
    except Exception as e:
        print(f"Failed to update device shadow: {e}")


def lambda_handler(event, context):
    try:
        print(f"Received event: {json.dumps(event)}")

        # Validate required fields
        required_fields = ['voltage', 'current', 'power', 'cumulative_energy']
        for field in required_fields:
            if field not in event:
                return {
                    'statusCode': 400,
                    'body': json.dumps({'error': f'Missing required field: {field}'})
                }

        # Get dynamic threshold from settings
        threshold = get_overload_threshold()

        # Check for overload
        is_overload = event['power'] > threshold

        # Build DynamoDB item
        item = {
            'deviceId': THING_NAME,
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'voltage': round(event['voltage'], 1),
            'current': round(event['current'], 2),
            'power': round(event['power'], 2),
            'cumulative_energy': round(event['cumulative_energy'], 4),
            'is_overload': is_overload
        }

        item = convert_floats_to_decimals(item)
        data_table.put_item(Item=item)
        print(f"Data written to DynamoDB: {item}")

        # Update device shadow — includes power_cutoff flag when overloaded
        update_device_shadow(event['power'], threshold, is_overload, item['timestamp'])

        # If overload, send alert and log to history
        if is_overload:
            item_with_threshold = {**item, 'threshold': threshold}
            send_overload_alert(item_with_threshold)
            log_alert_to_history(item_with_threshold)

        return {
            'statusCode': 200,
            'body': json.dumps({
                'success': True,
                'message': 'Data processed and stored',
                'is_overload': is_overload,
                'threshold': threshold
            })
        }

    except Exception as e:
        print(f"Error processing data: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
