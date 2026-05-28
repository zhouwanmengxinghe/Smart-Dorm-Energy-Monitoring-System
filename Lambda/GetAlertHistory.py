
"""
GetAlertHistory.py — API handler for GET /alerts.
Yifu Hou -23009975
Triggered by: API Gateway (GET /dev/alerts?limit=N).
Role: Scan DormAlertHistory for the most recent overload events,
      sort by timestamp descending, return as JSON.

Response: { success: true, count: N, data: [...] }
Each record: alertId, timestamp, deviceId, power, voltage, current,
             threshold, type ("overload").

IAM Policies: AWSLambdaBasicExecutionRole, AmazonDynamoDBFullAccess.
"""

import json
import boto3
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
ALERT_TABLE_NAME = 'DormAlertHistory'
table = dynamodb.Table(ALERT_TABLE_NAME)


class DecimalEncoder(json.JSONEncoder):
    """Custom JSON encoder to handle DynamoDB Decimal types."""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)


def lambda_handler(event, context):
    try:
        # Parse query parameters (default limit = 50)
        limit = 50
        if event.get('queryStringParameters'):
            limit_param = event['queryStringParameters'].get('limit', '50')
            try:
                limit = int(limit_param)
                if limit < 1:
                    limit = 50
            except ValueError:
                limit = 50

        # Scan the alert table (most recent first, sorted by timestamp descending)
        response = table.scan(Limit=limit)

        items = response.get('Items', [])

        # Sort descending by timestamp
        items.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
        items = items[:limit]

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
        print(f"Error fetching alert history: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            'body': json.dumps({'error': str(e)})
        }
