import { pool, generateTransactionId, parseTransactionDate, getUserMerchantCategory, getGlobalMerchantCategory, setGlobalMerchantCategory } from "@/lib/db";
import { getMerchantCategory, categorizeByCommonName } from "@/lib/places";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const placesApiKey = process.env.GOOGLE_PLACES_API_KEY;

interface Transaction {
  merchant_name: string;
  transaction_date: string;
  amount_spent: number;
  bitcoin_rewards: number;
}

async function extractTransactionsFromFrames(frames: string[]): Promise<Transaction[]> {
  // Build content array with all frames
  const content: any[] = [
    {
      type: "text",
      text: "Extract all credit card transactions visible in these video frames. Ignore any pending transactions. Return ONLY a valid JSON array.",
    },
  ];

  // Add each frame as an image
  for (const frame of frames) {
    content.push({
      type: "image_url",
      image_url: {
        url: frame, // Already a data URL
        detail: "high",
      },
    });
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a transaction extraction specialist. Analyze images showing credit card transactions and extract:
- merchant_name (string)
- transaction_date (format MM/DD/YYYY or similar)
- amount_spent (number, parse the dollar amount)
- bitcoin_rewards (number, parse the BTC Rewards amount shown in USDC, default to 0 if not shown)

IMPORTANT:
- IGNORE any transactions marked as "pending" or "Pending"
- Deduplicate: if you see the same transaction in multiple frames, only include it ONCE
- Look for completed/posted transactions only
- The "BTC Rewards" amount shown is denominated in USDC, not actual BTC

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
        content,
      },
    ],
    max_tokens: 4000,
  });

  const responseContent = response.choices[0].message.content;
  if (!responseContent) {
    throw new Error("No response from OpenAI");
  }

  // Log the raw response for debugging
  console.log("OpenAI response (first 500 chars):", responseContent.substring(0, 500));

  // Try to extract JSON array - handle various formats
  let jsonStr: string | null = null;
  
  // Try 1: Direct JSON array match
  const jsonMatch = responseContent.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }
  
  // Try 2: Extract from markdown code block
  if (!jsonStr) {
    const codeBlockMatch = responseContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      const innerMatch = codeBlockMatch[1].match(/\[[\s\S]*\]/);
      if (innerMatch) {
        jsonStr = innerMatch[0];
      }
    }
  }
  
  // Try 3: Check if response indicates no transactions
  if (!jsonStr) {
    const lowerContent = responseContent.toLowerCase();
    if (lowerContent.includes("no transaction") || lowerContent.includes("empty") || lowerContent.includes("[]")) {
      console.log("No transactions found in frames");
      return [];
    }
  }

  if (!jsonStr) {
    console.error("Failed to parse response:", responseContent);
    throw new Error("Could not parse transactions from response: " + responseContent.substring(0, 200));
  }

  try {
    return JSON.parse(jsonStr) as Transaction[];
  } catch (parseErr) {
    console.error("JSON parse error:", parseErr, "JSON string:", jsonStr.substring(0, 200));
    throw new Error("Invalid JSON in response: " + (parseErr as Error).message);
  }
}

// Legacy: extract from full video
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

Return ONLY a valid JSON array of transactions.`,
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

  // Try to extract JSON array - handle various formats
  let jsonStr: string | null = null;
  
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }
  
  if (!jsonStr) {
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      const innerMatch = codeBlockMatch[1].match(/\[[\s\S]*\]/);
      if (innerMatch) {
        jsonStr = innerMatch[0];
      }
    }
  }
  
  if (!jsonStr) {
    const lowerContent = content.toLowerCase();
    if (lowerContent.includes("no transaction") || lowerContent.includes("empty")) {
      return [];
    }
    throw new Error("Could not parse transactions from response: " + content.substring(0, 200));
  }

  return JSON.parse(jsonStr) as Transaction[];
}

async function processJob(job: any) {
  const { id, user_id, payload } = job;
  
  try {
    // Update status to processing
    await pool.query(
      "UPDATE jobs SET status = 'processing' WHERE id = $1",
      [id]
    );

    let rawTransactions: Transaction[];
    
    // Prefer frames, fall back to video
    if (payload.frames && payload.frames.length > 0) {
      console.log(`📸 Processing ${payload.frames.length} frames for job ${id}`);
      rawTransactions = await extractTransactionsFromFrames(payload.frames);
    } else if (payload.video) {
      console.log(`🎬 Processing video for job ${id}`);
      rawTransactions = await extractTransactionsFromVideo(payload.video);
    } else {
      throw new Error("No frames or video in payload");
    }

    let added = 0;
    let duplicates = 0;

    // Insert transactions with auto-categorization
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

      // Check for user-specific category override first (user's personal preference)
      let category = await getUserMerchantCategory(user_id, t.merchant_name);
      
      // If no user override, check global cache (avoid API calls for known merchants)
      if (!category) {
        category = await getGlobalMerchantCategory(t.merchant_name);
      }
      
      // If no cache, try common name mapping (fast, no API call)
      if (!category) {
        category = categorizeByCommonName(t.merchant_name);
        if (category) {
          // Cache the common name result globally
          await setGlobalMerchantCategory(t.merchant_name, category, 'common_name');
        }
      }
      
      // If still no category, call Google Places API and cache result
      if (!category && placesApiKey) {
        category = await getMerchantCategory(t.merchant_name, placesApiKey);
        if (category) {
          // Cache the Google Places result globally for future use
          await setGlobalMerchantCategory(t.merchant_name, category, 'google_places');
        }
      }

      try {
        await pool.query(
          `INSERT INTO transactions (id, user_id, merchant_name, transaction_date, amount_spent, bitcoin_rewards, category)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO NOTHING`,
          [
            transactionId,
            user_id,
            t.merchant_name,
            formattedDate,
            t.amount_spent,
            t.bitcoin_rewards || 0,
            category,
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
  return handleWorker();
}

export async function POST() {
  return handleWorker();
}

async function handleWorker() {
  try {
    // Get pending jobs (claim them immediately to prevent double-processing)
    const result = await pool.query(
      `UPDATE jobs 
       SET status = 'processing'
       WHERE id IN (
         SELECT id FROM jobs 
         WHERE status = 'pending' 
         ORDER BY created_at ASC 
         LIMIT 1
       )
       RETURNING id, user_id, payload`
    );

    if (result.rows.length === 0) {
      return Response.json({ message: "No pending jobs" });
    }

    // Process the job
    const job = result.rows[0];
    await processJob(job);

    return Response.json({ 
      processed: 1,
      jobId: job.id
    });
  } catch (error: any) {
    console.error("Worker error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
