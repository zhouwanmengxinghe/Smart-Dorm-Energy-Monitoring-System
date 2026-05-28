

"""
lambda_function.py — Core IoT data processing pipeline.
Yifu Hou -23009975
Triggered by: AWS IoT Core Rule (MQTT topic dorm/electricity/data).
Role: Main backend processor for the Smart Dorm EnergyGuard system.

Pipeline (8 steps per invocation):
  1. Validate required fields (voltage, current, power, cumulative_energy).
  2. Read dynamic overload threshold from DormSystemSettings (default 3000W).
  3. Zero-reading guard: if device publishes (0V,0A,0W) while shadow says
     power_cutoff=true, maintain cutoff — prevents rapid on/off cycling.
  4. Overload evaluation: power > threshold → is_overload = True.
  5. Persist to DormElectricData (float→Decimal conversion for DynamoDB).
  6. Update IoT device shadow (desired.power_cutoff only — reported is
     owned by the device).
  7. Publish 5 custom metrics to CloudWatch (SmartDorm/EnergyMetrics).
  8. If overload: send SNS email + log to DormAlertHistory.

AWS Services Used: DynamoDB, IoT Core (device shadow), SNS, CloudWatch.
IAM Policies: AWSLambdaBasicExecutionRole, AmazonDynamoDBFullAccess,
              AWSIoTDataAccess, AmazonSNSFullAccess, CloudWatchFullAccess.
"""

import json
import boto3
import os
from datetime import datetime
from decimal import Decimal

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
iot_client = boto3.client('iot-data', region_name='ap-southeast-2')
sns_client = boto3.client('sns', region_name='ap-southeast-2')
cloudwatch = boto3.client('cloudwatch', region_name='ap-southeast-2')

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


def update_device_shadow(is_overload):
    """
    Publish a power_cutoff command to the IoT device shadow.
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
        print(f"Device shadow updated — power_cutoff={'true' if is_overload else 'false'}")
    except Exception as e:
        print(f"Failed to update device shadow: {e}")


def publish_metrics(voltage, current, power, is_overload, threshold):
    """
    Publish custom metrics to CloudWatch for the analytics dashboard.

    Namespace: SmartDorm/EnergyMetrics
    Metrics published:
       Power      
       Current    
       Voltage    
       Overload   (1 = overload, 0 = normal)
       Threshold  
    These metrics appear in the CloudWatch Dashboard and can trigger
    """
    try:
        cloudwatch.put_metric_data(
            Namespace='SmartDorm/EnergyMetrics',
            MetricData=[
                {
                    'MetricName': 'Power',
                    'Value': power,
                    'Unit': 'None',
                    'Timestamp': datetime.utcnow()
                },
                {
                    'MetricName': 'Current',
                    'Value': current,
                    'Unit': 'None',
                    'Timestamp': datetime.utcnow()
                },
                {
                    'MetricName': 'Voltage',
                    'Value': voltage,
                    'Unit': 'None',
                    'Timestamp': datetime.utcnow()
                },
                {
                    'MetricName': 'Overload',
                    'Value': 1 if is_overload else 0,
                    'Unit': 'Count',
                    'Timestamp': datetime.utcnow()
                },
                {
                    'MetricName': 'Threshold',
                    'Value': threshold,
                    'Unit': 'None',
                    'Timestamp': datetime.utcnow()
                }
            ]
        )
        print("CloudWatch metrics published")
    except Exception as e:
        print(f"Failed to publish CloudWatch metrics: {e}")


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

        voltage = event['voltage']
        current = event['current']
        power = event['power']
        threshold = get_overload_threshold()

        # Zero-reading guard:
        # When the device cuts power, it publishes (0V, 0A, 0W).
        # The cutoff is ONLY lifted when the user raises the threshold
        # via the web dashboard -> UpdateAlertThreshold Lambda.
        is_device_cutoff = (voltage < 1.0 and current < 1.0 and power < 1.0)
        if is_device_cutoff:
            # Read the current shadow to check whether it's in cutoff
            shadow_doc = get_shadow_document()
            desired = shadow_doc.get('state', {}).get('desired', {})
            reported = shadow_doc.get('state', {}).get('reported', {})
            cutoff_state = desired.get('power_cutoff', reported.get('power_cutoff', 'false'))
            if cutoff_state == 'true':
                print("Device is in cutoff state (zero readings) — maintaining cutoff, skipping overload evaluation")
                is_overload = True  # preserve cutoff
                # Still write the zero reading so the Dashboard shows 0 power
                item = build_item(voltage, current, power, event['cumulative_energy'], is_overload)
                item = convert_floats_to_decimals(item)
                data_table.put_item(Item=item)
                update_device_shadow(is_overload)
                publish_metrics(voltage, current, power, is_overload, threshold)
                return {
                    'statusCode': 200,
                    'body': json.dumps({
                        'success': True,
                        'message': 'Zero reading — cutoff maintained',
                        'is_overload': is_overload,
                        'threshold': threshold
                    })
                }

        is_overload = power > threshold

        # Build DynamoDB item
        item = build_item(voltage, current, power, event['cumulative_energy'], is_overload)
        item = convert_floats_to_decimals(item)
        data_table.put_item(Item=item)
        print(f"Data written to DynamoDB: {item}")

        # Update device shadow — includes power_cutoff flag when overloaded
        update_device_shadow(is_overload)

        # Publish analytics metrics to CloudWatch
        publish_metrics(voltage, current, power, is_overload, threshold)

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


def get_shadow_document():
    """Read the current named shadow document from IoT Core."""
    try:
        resp = iot_client.get_thing_shadow(
            thingName=THING_NAME,
            shadowName=SHADOW_NAME
        )
        return json.loads(resp['payload'].read())
    except Exception as e:
        print(f"Failed to read shadow: {e}")
        return {}


def build_item(voltage, current, power, cumulative_energy, is_overload):
    """Construct a DynamoDB item dict (not yet Decimal-converted)."""
    return {
        'deviceId': THING_NAME,
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'voltage': round(voltage, 1),
        'current': round(current, 2),
        'power': round(power, 2),
        'cumulative_energy': round(cumulative_energy, 4),
        'is_overload': is_overload
    }
