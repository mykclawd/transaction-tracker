import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { Transaction } from "@/lib/types";
import { pool, generateTransactionId, parseTransactionDate } from "@/lib/db";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Extract frames from video using OpenAI Vision API
async function extractTransactionsFromVideo(base64Video: string) {
  // Remove data URL prefix
  const base64Data = base64Video.split(",")[1];

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a transaction extraction specialist. Analyze video frames showing credit card transactions and extract:
- merchant_name (string)
- transaction_date (format MM/DD/YYYY or similar)
- amount_spent (number, parse the dollar amount)
- bitcoin_rewards (number, parse BTC amount, default to 0 if not shown)

IGNORE any transactions marked as "pending" or "Pending".

Return ONLY a valid JSON array of transactions. Example:
[
  {
    "merchant_name": "Starbucks",
    "transaction_date": "01/15/2024",
    "amount_spent": 5.67,
    "bitcoin_rewards": 0.00000123
  }
]

If you see dates in other formats, convert to MM/DD/YYYY.`,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract all transactions from this video. Ignore pending transactions.",
          },
          {
            type: "input_video",
            input_video: {
              data: base64Video,
              format: "mp4",
            },
          },
        ],
      },
    ],
    max_tokens: 4000,
  });

  const content = response.choices[0].message.content;
  if (!content) {
    throw new Error("No response from OpenAI");
  }

  // Extract JSON from response
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("Could not parse transactions from response");
  }

  return JSON.parse(jsonMatch[0]) as Transaction[];
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

    // Extract transactions from video
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
