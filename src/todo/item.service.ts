import {
  DeleteCommand,
  DeleteCommandInput,
  DynamoDBDocumentClient,
  ScanCommand,
  ScanCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { dynamoDBClient } from "../db";
import { PutObjectCommandInput, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

export class ItemService {
  private readonly documentClient: DynamoDBDocumentClient;
  private readonly s3Client: S3Client;

  private ITEM_TABLE = process.env.ITEM_TABLE as string;
  private ITEM_ARCHIVE_BUCKET = process.env.ITEM_ARCHIVE_BUCKET as string;
  private THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  constructor() {
    this.documentClient = dynamoDBClient();
    this.s3Client = new S3Client({
      region: "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
      },
      forcePathStyle: false,
    });
  }

  async archiveItem() {
    try {
      // Scan for items older than 30 days
      const commandInput: ScanCommandInput = {
        TableName: this.ITEM_TABLE,
        FilterExpression: "#createdAt < :thirtyDaysAgo",
        ExpressionAttributeNames: {
          "#createdAt": "createdAt",
        },
        ExpressionAttributeValues: {
          ":thirtyDaysAgo": this.THIRTY_DAYS_AGO,
        },
        ExclusiveStartKey: undefined,
      };

      const itemsToArchive = [];
      let scanResult;
      do {
        const command = new ScanCommand(commandInput);
        scanResult = await this.documentClient.send(command);
        if (scanResult.Items) {
          itemsToArchive.push(...scanResult.Items);
        }
        commandInput.ExclusiveStartKey = scanResult.LastEvaluatedKey;
      } while (scanResult.LastEvaluatedKey);

      if (itemsToArchive.length === 0) {
        console.log("No items to archive.");
        return;
      }

      console.log(itemsToArchive);
      // Write items to S3
      const archiveFileName = `archive-${Date.now()}.json`;
      const uploadParams: PutObjectCommandInput = {
        Bucket: this.ITEM_ARCHIVE_BUCKET,
        Key: archiveFileName,
        Body: JSON.stringify(itemsToArchive, null, 2),
        ContentType: "application/json",
      };

      const upload = new Upload({
        client: this.s3Client,
        params: uploadParams,
      });

      upload.on("httpUploadProgress", (progress) => {
        console.log(
          `Uploading archived file: ${archiveFileName} - ${progress.loaded} / ${progress.total}`,
        );
      });

      const uploadResult = await upload.done();
      if (uploadResult.$metadata.httpStatusCode !== 200) {
        console.error("Failed to upload archived file to S3:", JSON.stringify(uploadResult));
        return null;
      }

      console.log(`Archived ${itemsToArchive.length} items to ${archiveFileName}`);

      // Delete items from DynamoDB
      for (const item of itemsToArchive) {
        const commandInput: DeleteCommandInput = {
          TableName: this.ITEM_TABLE,
          Key: { itemId: item.itemId },
        };
        const command = new DeleteCommand(commandInput);
        await this.documentClient.send(command);
      }

      console.log(`Deleted ${itemsToArchive.length} items from DynamoDB`);
    } catch (error) {
      console.error("Error archiving items:", error);
    }
  }
}
