import json
import boto3
import random

iot_client = boto3.client('iot-data', region_name='ap-southeast-2')
MQTT_TOPIC = 'dorm/electricity/data'


def lambda_handler(event, context):
    try:
        body = {}
        if event.get('body'):
            body = json.loads(event.get('body', '{}'))

        custom_power = body.get('power')
        custom_current = body.get('current')
        custom_voltage = body.get('voltage')

        # Use custom voltage if provided, otherwise random 228-232V
        if custom_voltage is not None:
            voltage = round(float(custom_voltage), 1)
        else:
            voltage = round(random.uniform(228.0, 232.0), 1)

        # Determine power and current from whichever parameter was provided
        if custom_power is not None:
            power = float(custom_power)
            current = round(power / voltage, 2)
        elif custom_current is not None:
            current = float(custom_current)
            power = round(voltage * current, 2)
        else:
            current = round(random.uniform(0.5, 4.5), 2)
            power = round(voltage * current, 2)

        cumulative_energy = round(random.uniform(0.01, 10.0), 4)

        payload = {
            'voltage': voltage,
            'current': current,
            'power': power,
            'cumulative_energy': cumulative_energy
        }

        # Publish to IoT Core topic
        iot_client.publish(
            topic=MQTT_TOPIC,
            qos=1,
            payload=json.dumps(payload)
        )

        print(f"Simulated data published: {json.dumps(payload)}")

        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            },
            'body': json.dumps({
                'success': True,
                'message': 'Simulated data published to IoT Core',
                'data': payload
            })
        }

    except Exception as e:
        print(f"Error simulating device data: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            },
            'body': json.dumps({'error': str(e)})
        }
