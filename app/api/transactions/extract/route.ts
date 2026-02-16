import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { Transaction } from "@/lib/types";
import { pool, generateTransactionId, parseTransactionDate } from "@/lib/db";

const EXTRACTOR_URL = process.env.VIDEO_EXTRACTOR_URL || 'http://3.148.166.254:3456/api/extract-transactions';
const EXTRACTOR_API_KEY = process.env.VIDEO_EXTRACTOR_API_KEY;

// Extract transactions using Clawd's video extractor service (Gemini 1.5 Pro)
async function extractTransactionsFromVideo(base64Video: string): Promise<Transaction[]> {
  if (!EXTRACTOR_API_KEY) {
    throw new Error("VIDEO_EXTRACTOR_API_KEY not configured");
  }

  const response = await fetch(EXTRACTOR_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': EXTRACTOR_API_KEY,
    },
    body: JSON.stringify({ video: base64Video }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Video extraction failed: ${response.statusText}`);
  }

  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'Video extraction failed');
  }

  console.log(`Extracted ${data.count} transactions using ${data.provider} in ${data.processingMs}ms`);
  
  return data.transactions;
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { video } = await request.json();

    if (!video) {
      return NextResponse.json(
        { error: "No video provided" },
        { status: 400 }
      );
    }

    // Extract transactions from video using Clawd's service
    const rawTransactions = await extractTransactionsFromVideo(video);

    let added = 0;
    let duplicates = 0;
    const insertedIds: string[] = [];

    // Insert transactions with deduplication
    for (const t of rawTransactions) {
      const formattedDate = parseTransactionDate(t.transaction_date);
      if (!formattedDate) {
        console.warn(`Skipping transaction with invalid date: ${t.transaction_date}`);
        continue;
      }

      const transactionId = generateTransactionId(
        userId,
        t.merchant_name,
        formattedDate,
        t.amount_spent,
        t.bitcoin_rewards || 0
      );

      try {
        await pool.query(
          `INSERT INTO transactions (id, user_id, merchant_name, transaction_date, amount_spent, bitcoin_rewards)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [
            transactionId,
            userId,
            t.merchant_name,
            formattedDate,
            t.amount_spent,
            t.bitcoin_rewards || 0,
          ]
        );

        insertedIds.push(transactionId);
        added++;
      } catch (err: any) {
        if (err.code === "23505") {
          // Unique violation - duplicate
          duplicates++;
        } else {
          throw err;
        }
      }
    }

    return NextResponse.json({
      transactions: rawTransactions,
      added,
      duplicates,
    });
  } catch (error) {
    console.error("Error processing video:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process video" },
      { status: 500 }
    );
  }
}
