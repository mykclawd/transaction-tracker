import { pool, generateTransactionId, parseTransactionDate } from "@/lib/db";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface Transaction {
  merchant_name: string;
  transaction_date: string;
  amount_spent: number;
  bitcoin_rewards: number;
}

async function extractTransactionsFromVideo(base64Video: string): Promise<Transaction[]> {
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
            type: "input_video" as any,
            input_video: {
              data: base64Video,
              format: "mp4",
            },
          } as any,
        ],
      },
    ],
    max_tokens: 4000,
  });

  const content = response.choices[0].message.content;
  if (!content) {
    throw new Error("No response from OpenAI");
  }

  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("Could not parse transactions from response");
  }

  return JSON.parse(jsonMatch[0]) as Transaction[];
}

async function processJob(job: any) {
  const { id, user_id, payload } = job;
  
  try {
    // Update status to processing
    await pool.query(
      "UPDATE jobs SET status = 'processing' WHERE id = $1",
      [id]
    );

    const { video } = payload;
    const rawTransactions = await extractTransactionsFromVideo(video);

    let added = 0;
    let duplicates = 0;

    // Insert transactions
    for (const t of rawTransactions) {
      const formattedDate = parseTransactionDate(t.transaction_date);
      if (!formattedDate) continue;

      const transactionId = generateTransactionId(
        user_id,
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
            user_id,
            t.merchant_name,
            formattedDate,
            t.amount_spent,
            t.bitcoin_rewards || 0,
          ]
        );
        added++;
      } catch (err: any) {
        if (err.code === "23505") {
          duplicates++;
        } else {
          throw err;
        }
      }
    }

    // Update job as completed
    await pool.query(
      `UPDATE jobs SET status = 'completed', result = $1, completed_at = NOW() WHERE id = $2`,
      [JSON.stringify({ transactions: rawTransactions, added, duplicates }), id]
    );

    console.log(`✅ Job ${id} completed: ${added} added, ${duplicates} duplicates`);
  } catch (error: any) {
    console.error(`❌ Job ${id} failed:`, error.message);
    await pool.query(
      `UPDATE jobs SET status = 'failed', error = $1, completed_at = NOW() WHERE id = $2`,
      [error.message, id]
    );
  }
}

export async function GET() {
  try {
    // Get pending jobs
    const result = await pool.query(
      `SELECT id, user_id, payload FROM jobs 
       WHERE status = 'pending' 
       ORDER BY created_at ASC 
       LIMIT 5`
    );

    if (result.rows.length === 0) {
      return Response.json({ message: "No pending jobs" });
    }

    // Process jobs sequentially
    for (const job of result.rows) {
      await processJob(job);
    }

    return Response.json({ 
      processed: result.rows.length,
      jobs: result.rows.map(j => j.id)
    });
  } catch (error: any) {
    console.error("Worker error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
