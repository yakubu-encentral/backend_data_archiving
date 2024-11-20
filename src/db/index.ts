import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export const dynamoDBClient = (): DynamoDBDocumentClient => {
  if (process.env.local) {
    const client = new DynamoDBClient({
      region: "localhost",
      endpoint: "http://localhost:8000",
      credentials: {
        accessKeyId: "MockAccessKeyId",
        secretAccessKey: "MockSecretAccessKey",
      },
    });
    const docClient = DynamoDBDocumentClient.from(client);
    return docClient;
  }

  const client = new DynamoDBClient();
  const docClient = DynamoDBDocumentClient.from(client);
  return docClient;
};
