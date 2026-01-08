#!/usr/bin/env ts-node

import { parse } from 'csv-parse';
import { createReadStream } from 'fs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

interface RussellIndexItem {
    symbol: string;
    name: string;
}

interface DynamoDBItem {
    timestamp: string;
    symbol: string;
    name: string;
}

/**
 * Parse CSV file and extract Symbol and Name columns
 * @param csvFilePath Path to the CSV file
 * @returns Promise resolving to array of parsed items
 */
async function parseCSV(csvFilePath: string): Promise<RussellIndexItem[]> {
    return new Promise((resolve, reject) => {
        const items: RussellIndexItem[] = [];

        createReadStream(csvFilePath)
            .pipe(parse({
                columns: true,
                skip_empty_lines: true,
                trim: true
            }))
            .on('data', (row: any) => {
                // Extract only Symbol and Name columns
                if (row.Symbol && row.Name) {
                    items.push({
                        symbol: row.Symbol,
                        name: row.Name
                    });
                }
            })
            .on('error', (error) => {
                console.error('Error parsing CSV:', error);
                reject(error);
            })
            .on('end', () => {
                console.log(`Parsed ${items.length} items from CSV`);
                resolve(items);
            });
    });
}

/**
 * Chunk array into batches of specified size
 * @param items Array to chunk
 * @param batchSize Size of each batch (max 25 for DynamoDB)
 * @returns Array of batches
 */
function chunkItems<T>(items: T[], batchSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
        chunks.push(items.slice(i, i + batchSize));
    }
    return chunks;
}

/**
 * Write items to DynamoDB in batches
 * @param items Items to write
 * @param timestamp Timestamp to use as partition key
 * @param tableName DynamoDB table name
 * @param client DynamoDB document client
 */
async function batchWriteToDynamoDB(
    items: RussellIndexItem[],
    timestamp: string,
    tableName: string,
    client: DynamoDBDocumentClient
): Promise<void> {
    const BATCH_SIZE = 25; // DynamoDB batch write limit
    const batches = chunkItems(items, BATCH_SIZE);

    console.log(`Writing ${items.length} items in ${batches.length} batches`);

    let successCount = 0;

    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];

        // Transform items to include timestamp
        const dynamoItems: DynamoDBItem[] = batch.map(item => ({
            timestamp,
            symbol: item.symbol,
            name: item.name
        }));

        // Prepare batch write request
        const putRequests = dynamoItems.map(item => ({
            PutRequest: {
                Item: item
            }
        }));

        try {
            const command = new BatchWriteCommand({
                RequestItems: {
                    [tableName]: putRequests
                }
            });

            await client.send(command);
            successCount += batch.length;
            console.log(`Batch ${i + 1}/${batches.length} written successfully (${successCount}/${items.length} items)`);
        } catch (error) {
            console.error(`Error writing batch ${i + 1}:`, error);
            throw error;
        }
    }

    console.log(`Successfully stored ${successCount} items to DynamoDB`);
}

/**
 * Main ingestion function
 */
async function main() {
    // Parse command line arguments
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.error('Usage: ts-node ingest-russell-index.ts <csv-file-path> <timestamp> [table-name]');
        console.error('Example: ts-node ingest-russell-index.ts ../data/russell-1000-index-11-25-2025.csv 2025-11-25');
        process.exit(1);
    }

    const csvFilePath = args[0];
    const timestamp = args[1];
    const tableName = args[2] || process.env.RUSSELL_INDEX_TABLE_NAME || 'dev-tmagikarp-russell-index';

    console.log('Starting Russell Index ingestion...');
    console.log(`CSV File: ${csvFilePath}`);
    console.log(`Timestamp: ${timestamp}`);
    console.log(`Table Name: ${tableName}`);

    try {
        // Step 1: Parse CSV file
        const items = await parseCSV(csvFilePath);

        if (items.length === 0) {
            console.error('No items found in CSV file');
            process.exit(1);
        }

        // Step 2: Initialize DynamoDB client
        const client = new DynamoDBClient({});
        const docClient = DynamoDBDocumentClient.from(client);

        // Step 3: Write to DynamoDB
        await batchWriteToDynamoDB(items, timestamp, tableName, docClient);

        console.log('Ingestion completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Ingestion failed:', error);
        process.exit(1);
    }
}

// Run main function
main();
