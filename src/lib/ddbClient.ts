import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const dynamo = new DynamoDBClient({});
export const docClient = DynamoDBDocumentClient.from(dynamo, {
  marshallOptions: { removeUndefinedValues: true },
});

export interface ScanResult {
  items: Array<Record<string, unknown>>;
  count: number;
  lastEvaluatedKey?: Record<string, unknown>;
}

// Scans a platform install table. Pagination is intentional — admin tools should
// never silently truncate. Caller passes lastEvaluatedKey to continue.
export const scanInstalls = async (
  tableName: string,
  limit = 100,
  exclusiveStartKey?: Record<string, unknown>,
): Promise<ScanResult> => {
  const result = await docClient.send(
    new ScanCommand({
      TableName: tableName,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );
  return {
    items: (result.Items as Array<Record<string, unknown>>) ?? [],
    count: result.Count ?? 0,
    lastEvaluatedKey: result.LastEvaluatedKey as Record<string, unknown> | undefined,
  };
};
