import { pool, generateTransactionId, parseTransactionDate, getUserMerchantCategory, getGlobalMerchantCategory, setGlobalMerchantCategory } from "@/lib/db";
import { getMerchantCategory, categorizeByCommonName } from "@/lib/places";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const placesApiKey = process.env.GOOGLE_PLACES_API_KEY;

// Retry helper for rate limit errors
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
  baseDelayMs: number = 2000  // Start with 2 seconds, more retries
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Check if it's a rate limit error (429)
      const isRateLimit = error?.status === 429 || 
                          error?.message?.includes('429') ||
                          error?.message?.includes('rate limit') ||
                          error?.message?.includes('quota');
      
      if (isRateLimit && attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt); // 10s, 20s, 40s, 80s, 160s
        console.log(`Rate limited, retrying in ${delay/1000}s (attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError;
}


interface Transaction {
  merchant_name: string;
  transaction_date: string;
  amount_spent: number;
  bitcoin_rewards: number;
}

async function extractTransactionsFromFrames(frames: string[]): Promise<Transaction[]> {
  console.log(`🔍 Extracting from ${frames.length} frames...`);
  const startTime = Date.now();
  
  // Build content array with all frames
  const content: any[] = [
    {
      type: "text",
      text: `Extract ALL credit card transactions visible in these ${frames.length} video frames. Count carefully and extract every single one.`,
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

  // Wrap in retry for rate limit handling
  const response = await withRetry(() => openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a transaction extraction specialist. Analyze images showing credit card transactions and extract EVERY SINGLE TRANSACTION visible.

Extract these fields for each transaction:
- merchant_name (string) - the business name
- transaction_date (format MM/DD/YYYY) - convert any date format to MM/DD/YYYY
- amount_spent (number) - the dollar amount spent
- bitcoin_rewards (number) - the USDC value shown in the "BTC Rewards" column (NOT the BTC amount, but the USDC equivalent shown)

CRITICAL RULES:
1. EXTRACT EVERY TRANSACTION YOU SEE - do not skip any
2. IGNORE any transactions marked as "pending" or "Pending"
3. IGNORE "Payment made" or "Payment received" entries (these are credit card payments, not purchases)
4. Deduplicate: if the same transaction appears in multiple frames, include it ONCE
5. Look for completed/posted transactions only
6. The "BTC Rewards" column shows a USDC value (e.g., "$1.23" or "1.23") - extract just the number

Return ONLY a valid JSON array. Example:
[
  {
    "merchant_name": "Starbucks",
    "transaction_date": "01/15/2024",
    "amount_spent": 5.67,
    "bitcoin_rewards": 1.23
  }
]`,
      },
      {
        role: "user",
        content,
      },
    ],
    max_tokens: 8000,
  }));

  const responseContent = response.choices[0].message.content;
  if (!responseContent) {
    throw new Error("No response from OpenAI");
  }

  // Log the raw response for debugging
  console.log("OpenAI response (first 500 chars):", responseContent.substring(0, 500));

  // Step 1: Strip markdown code block markers if present
  let cleanedContent = responseContent;
  
  // Remove opening ```json or ``` 
  cleanedContent = cleanedContent.replace(/^```(?:json)?\s*/i, '');
  // Remove closing ```
  cleanedContent = cleanedContent.replace(/```\s*$/, '');
  
  // Step 2: Try to extract JSON array
  const jsonMatch = cleanedContent.match(/\[[\s\S]*\]/);
  
  if (!jsonMatch) {
    // Check if response indicates no transactions
    const lowerContent = responseContent.toLowerCase();
    if (lowerContent.includes("no transaction") || lowerContent.includes("empty") || lowerContent.includes("[]")) {
      console.log("No transactions found in frames");
      return [];
    }
    
    console.error("Failed to parse response:", responseContent);
    throw new Error("Could not parse transactions from response: " + responseContent.substring(0, 200));
  }

  let jsonStr = jsonMatch[0];
  
  // Step 3: Try to parse, and if it fails due to truncation, try to fix it
  try {
    const parsed = JSON.parse(jsonStr) as Transaction[];
    console.log(`✅ Parsed ${parsed.length} transactions in ${Date.now() - startTime}ms`);
    return parsed;
  } catch (parseErr) {
    console.log("Initial parse failed, attempting to fix truncated JSON...");
    
    // Try to fix truncated JSON by finding the last complete object
    // Count brackets to find where we have complete objects
    let depth = 0;
    let lastCompleteIndex = -1;
    let inString = false;
    let escaped = false;
    
    for (let i = 0; i < jsonStr.length; i++) {
      const char = jsonStr[i];
      
      if (escaped) {
        escaped = false;
        continue;
      }
      
      if (char === '\\' && inString) {
        escaped = true;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        continue;
      }
      
      if (inString) continue;
      
      if (char === '[' || char === '{') {
        depth++;
      } else if (char === ']' || char === '}') {
        depth--;
        if (depth === 1 && char === '}') {
          // Found end of a complete object at array level
          lastCompleteIndex = i;
        }
      }
    }
    
    if (lastCompleteIndex > 0) {
      // Truncate to last complete object and close the array
      const fixedJson = jsonStr.substring(0, lastCompleteIndex + 1) + ']';
      console.log("Attempting fixed JSON (truncated at last complete object)");
      try {
        return JSON.parse(fixedJson) as Transaction[];
      } catch (fixErr) {
        console.error("Fixed JSON also failed:", fixErr);
      }
    }
    
    console.error("JSON parse error:", parseErr, "JSON string:", jsonStr.substring(0, 300));
    throw new Error("Invalid JSON in response: " + (parseErr as Error).message);
  }
}

// Legacy: extract from full video
async function extractTransactionsFromVideo(base64Video: string): Promise<Transaction[]> {
  const response = await withRetry(() => openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a transaction extraction specialist. Analyze this video showing credit card transactions and extract EVERY SINGLE TRANSACTION visible.

Extract these fields for each transaction:
- merchant_name (string) - the business name
- transaction_date (format MM/DD/YYYY) - convert any date format
- amount_spent (number) - the dollar amount spent
- bitcoin_rewards (number) - the USDC value shown in the "BTC Rewards" column

CRITICAL RULES:
1. EXTRACT EVERY TRANSACTION YOU SEE - do not skip any
2. IGNORE any transactions marked as "pending" or "Pending"
3. IGNORE "Payment made" or "Payment received" entries
4. The "BTC Rewards" column shows a USDC value - extract just the number

Return ONLY a valid JSON array.`,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract all credit card transactions from this video. Include merchant name, date, amount spent, and BTC Rewards in USDC.",
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
    max_tokens: 8000,
  }));

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
    // Update status to processing with start time
    await pool.query(
      "UPDATE jobs SET status = 'processing', started_at = NOW() WHERE id = $1",
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

    // Calculate total bitcoin rewards from this batch
    const totalRewards = rawTransactions.reduce((sum, t) => sum + (Number(t.bitcoin_rewards) || 0), 0);
    
    // Update job as completed with detailed metrics
    await pool.query(
      `UPDATE jobs SET status = 'completed', result = $1, completed_at = NOW() WHERE id = $2`,
      [JSON.stringify({ 
        transactions: rawTransactions, 
        added, 
        duplicates,
        extractionCount: rawTransactions.length,
        totalBitcoinRewards: totalRewards
      }), id]
    );

    console.log(`✅ Job ${id} completed: ${added} added, ${duplicates} duplicates, $${totalRewards.toFixed(2)} in BTC rewards`);
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

// Configuration for concurrent processing
const MAX_CONCURRENT_JOBS = 2;
const JOB_TIMEOUT_MINUTES = 5;

async function handleWorker() {
  try {
    // Auto-retry failed jobs (max 2 retries)
    await pool.query(
      `UPDATE jobs 
       SET status = 'pending', 
           retry_count = COALESCE(retry_count, 0) + 1,
           updated_at = NOW()
       WHERE id IN (
         SELECT id FROM jobs 
         WHERE status = 'failed' 
         AND COALESCE(retry_count, 0) < 2
         ORDER BY created_at ASC 
         LIMIT 2
       )`
    );

    // Reset any stuck jobs (running longer than timeout)
    const stuckResult = await pool.query(
      `UPDATE jobs 
       SET status = 'pending'
       WHERE status = 'processing' 
       AND started_at < NOW() - INTERVAL '${JOB_TIMEOUT_MINUTES} minutes'
       RETURNING id`
    );
    
    if (stuckResult.rows.length > 0) {
      console.log(`🔄 Reset ${stuckResult.rows.length} stuck jobs`);
    }

    // Check current processing count
    const processingCountResult = await pool.query(
      `SELECT COUNT(*) as count FROM jobs WHERE status = 'processing'`
    );
    const processingCount = parseInt(processingCountResult.rows[0].count);
    
    const availableSlots = MAX_CONCURRENT_JOBS - processingCount;
    
    if (availableSlots <= 0) {
      console.log(`⏳ At capacity: ${processingCount} jobs processing`);
      return Response.json({ 
        message: "At max concurrent capacity", 
        processing: processingCount 
      });
    }

    // Claim up to availableSlots pending jobs
    const result = await pool.query(
      `UPDATE jobs 
       SET status = 'processing', started_at = NOW()
       WHERE id IN (
         SELECT id FROM jobs 
         WHERE status = 'pending' 
         ORDER BY created_at ASC 
         LIMIT $1
       )
       RETURNING id, user_id, payload`,
      [availableSlots]
    );

    if (result.rows.length === 0) {
      return Response.json({ message: "No pending jobs" });
    }

    // Process all claimed jobs concurrently
    console.log(`🚀 Processing ${result.rows.length} jobs concurrently`);
    const startTime = Date.now();
    
    await Promise.all(result.rows.map(job => processJob(job)));
    
    const duration = Date.now() - startTime;
    console.log(`✅ Batch completed in ${duration}ms`);

    return Response.json({ 
      processed: result.rows.length,
      jobIds: result.rows.map(r => r.id),
      durationMs: duration
    });
  } catch (error: any) {
    console.error("Worker error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
