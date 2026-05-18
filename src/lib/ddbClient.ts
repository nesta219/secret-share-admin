import { DynamoDBClient, ResourceNotFoundException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const dynamo = new DynamoDBClient({});
export const docClient = DynamoDBDocumentClient.from(dynamo, {
  marshallOptions: { removeUndefinedValues: true },
});

export interface ScanResult {
  items: Array<Record<string, unknown>>;
  count: number;
  lastEvaluatedKey?: Record<string, unknown>;
  tableExists: boolean;
}

// Scans a platform install table. Pagination is intentional — admin tools should
// never silently truncate. Caller passes lastEvaluatedKey to continue.
//
// If the table doesn't exist (e.g. a platform is configured in env.hcl but its
// repo hasn't been deployed yet), returns empty + tableExists=false rather than
// throwing. Routes use this to render an "(not yet deployed)" empty state.
export const scanInstalls = async (
  tableName: string,
  limit = 100,
  exclusiveStartKey?: Record<string, unknown>,
): Promise<ScanResult> => {
  try {
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
      tableExists: true,
    };
  } catch (err) {
    if (err instanceof ResourceNotFoundException) {
      return { items: [], count: 0, tableExists: false };
    }
    throw err;
  }
};
