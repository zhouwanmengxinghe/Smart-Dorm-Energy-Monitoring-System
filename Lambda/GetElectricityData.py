

"""
GetElectricityData.py — API handler for GET /data.
Yifu Hou -23009975
Triggered by: API Gateway (GET /dev/data?limit=N).
Role: Query the most recent electricity readings from DormElectricData,
      return them as JSON with timestamp-descending order.

Response: { success: true, count: N, data: [...] }
Each record: deviceId, timestamp, voltage, current, power,
             cumulative_energy, is_overload.

IAM Policies: AWSLambdaBasicExecutionRole, AmazonDynamoDBFullAccess.
"""

import json
import boto3
from decimal import Decimal
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
TABLE_NAME = 'DormElectricData'
table = dynamodb.Table(TABLE_NAME)


class DecimalEncoder(json.JSONEncoder):
    """Custom JSON encoder to handle DynamoDB Decimal types."""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)


def lambda_handler(event, context):
    try:
        # Parse query parameters (default limit = 100)
        limit = 100
        if event.get('queryStringParameters'):
            limit_param = event['queryStringParameters'].get('limit', '100')
            try:
                limit = int(limit_param)
                if limit < 1:
                    limit = 100
            except ValueError:
                limit = 100

        # Query DynamoDB for the most recent records
        response = table.query(
            KeyConditionExpression=Key('deviceId').eq('DormRaspberryPi'),
            ScanIndexForward=False,  # descending by sort key (timestamp)
            Limit=limit
        )

        items = response.get('Items', [])

        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            'body': json.dumps({
                'success': True,
                'count': len(items),
                'data': items
            }, cls=DecimalEncoder)
        }

    except Exception as e:
        print(f"Error fetching electricity data: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            'body': json.dumps({'error': str(e)})
        }
