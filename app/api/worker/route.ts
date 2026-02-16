import { pool, generateTransactionId, parseTransactionDate, getUserMerchantCategory, getGlobalMerchantCategory, setGlobalMerchantCategory } from "@/lib/db";
import { getMerchantCategory, categorizeByCommonName } from "@/lib/places";
import OpenAI from "openai";
import { S3Client, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const placesApiKey = process.env.GOOGLE_PLACES_API_KEY;

// R2 client for downloading videos
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "transaction-tracker";

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID || "",
    secretAccessKey: R2_SECRET_ACCESS_KEY || "",
  },
});

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
        content: `You are a meticulous transaction extraction specialist. Your job is to extract EVERY SINGLE TRANSACTION from credit card app screenshots. Missing even ONE transaction is a critical failure.

EXTRACTION PROCESS:
1. First, scan ALL frames and COUNT how many unique transactions you see
2. Then extract each one - verify your count matches
3. If a transaction is partially visible, still extract it with your best guess

FIELDS TO EXTRACT:
- merchant_name (string) - the business name exactly as shown
- transaction_date (string, format MM/DD/YYYY) - convert any date format
- amount_spent (number) - the dollar amount (negative values = refunds, make positive)
- bitcoin_rewards (number) - the USDC value in "BTC Rewards" column (just the number, not the "$")

WHAT TO EXTRACT:
✓ All completed/posted purchase transactions
✓ Refunds (as positive amounts)
✓ Partially visible transactions (extract what you can see)

WHAT TO SKIP:
✗ "Pending" transactions (has "Pending" label)
✗ "Payment made" or "Payment received" (credit card payments, not purchases)
✗ Duplicate entries (same merchant + date + amount appearing in multiple frames)

IMPORTANT - DO NOT SKIP TRANSACTIONS:
- If you see a row with a merchant name, date, and amount - EXTRACT IT
- When in doubt, extract it (duplicates are handled downstream)
- Each row in the transaction list = one extraction
- Count the rows you see, then verify your output has that many items

Return ONLY a valid JSON array:
[{"merchant_name": "Store Name", "transaction_date": "01/15/2024", "amount_spent": 5.67, "bitcoin_rewards": 1.23}]`,
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

// Extract from full video using Clawd's Gemini-powered video extractor service
const VIDEO_EXTRACTOR_URL = process.env.VIDEO_EXTRACTOR_URL || 'http://3.148.166.254:3456/api/extract-transactions';
const VIDEO_EXTRACTOR_API_KEY = process.env.VIDEO_EXTRACTOR_API_KEY;

async function extractTransactionsFromVideo(base64Video: string): Promise<Transaction[]> {
  if (!VIDEO_EXTRACTOR_API_KEY) {
    throw new Error("VIDEO_EXTRACTOR_API_KEY not configured");
  }

  console.log(`🎬 Sending video to Gemini extractor service...`);
  const startTime = Date.now();

  const response = await fetch(VIDEO_EXTRACTOR_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': VIDEO_EXTRACTOR_API_KEY,
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

  console.log(`✅ Gemini extracted ${data.count} transactions in ${data.processingMs}ms (total: ${Date.now() - startTime}ms)`);
  
  return data.transactions;
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
    let frameKeysToCleanup: string[] | null = null;
    
    // Handle different payload types
    if (payload.frameKeys && payload.frameKeys.length > 0) {
      // New: Process frames stored in R2
      console.log(`📸 Processing ${payload.frameKeys.length} frames from R2 for job ${id}`);
      frameKeysToCleanup = payload.frameKeys;
      
      // Download all frames from R2 in parallel
      const framePromises = payload.frameKeys.map(async (key: string) => {
        const getCommand = new GetObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: key,
        });
        
        const response = await r2Client.send(getCommand);
        const chunks: Buffer[] = [];
        const stream = response.Body as any;
        
        for await (const chunk of stream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        
        const buffer = Buffer.concat(chunks);
        return `data:image/jpeg;base64,${buffer.toString('base64')}`;
      });
      
      const frames = await Promise.all(framePromises);
      console.log(`✅ Downloaded ${frames.length} frames from R2`);
      
      rawTransactions = await extractTransactionsFromFrames(frames);
    } else if (payload.videoKey) {
      console.log(`🎬 Processing video from R2 for job ${id}: ${payload.videoKey}`);
      try {
        const key = payload.videoKey;
        
        console.log(`📥 Downloading from R2 bucket: ${key}`);
        
        // Download from R2 using S3 SDK (authenticated)
        const getCommand = new GetObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: key,
        });
        
        const videoResponse = await r2Client.send(getCommand);
        const contentLength = videoResponse.ContentLength;
        console.log(`📥 Downloading video: ${contentLength ? (contentLength/1024/1024).toFixed(2) + 'MB' : 'unknown size'}`);
        
        // Convert stream to buffer
        const chunks: Buffer[] = [];
        const stream = videoResponse.Body as any;
        
        for await (const chunk of stream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        
        const videoBuffer = Buffer.concat(chunks);
        console.log(`✅ Downloaded ${(videoBuffer.length/1024/1024).toFixed(2)}MB`);
        
        const base64Video = videoBuffer.toString('base64');
        rawTransactions = await extractTransactionsFromVideo(base64Video);
      } catch (fetchError: any) {
        console.error(`❌ Failed to fetch video from R2:`, fetchError.message);
        throw new Error(`Failed to download video from storage: ${fetchError.message}`);
      }
    } else if (payload.frames && payload.frames.length > 0) {
      console.log(`📸 Processing ${payload.frames.length} frames for job ${id}`);
      rawTransactions = await extractTransactionsFromFrames(payload.frames);
    } else if (payload.video) {
      console.log(`🎬 Processing base64 video for job ${id}`);
      rawTransactions = await extractTransactionsFromVideo(payload.video);
    } else {
      throw new Error("No frames, video, or videoUrl in payload");
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
    
    // Cleanup: delete video from R2 after successful processing
    if (payload.videoKey) {
      try {
        await r2Client.send(new DeleteObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: payload.videoKey,
        }));
        console.log(`🗑️ Deleted video from R2: ${payload.videoKey}`);
      } catch (cleanupErr: any) {
        console.warn(`⚠️ Failed to cleanup R2 video: ${cleanupErr.message}`);
      }
    }
    
    // Cleanup: delete frames from R2 after successful processing
    if (frameKeysToCleanup && frameKeysToCleanup.length > 0) {
      try {
        // Delete in batches of 1000 (S3 limit)
        for (let i = 0; i < frameKeysToCleanup.length; i += 1000) {
          const batch = frameKeysToCleanup.slice(i, i + 1000);
          await r2Client.send(new DeleteObjectsCommand({
            Bucket: R2_BUCKET_NAME,
            Delete: {
              Objects: batch.map(key => ({ Key: key })),
            },
          }));
        }
        console.log(`🗑️ Deleted ${frameKeysToCleanup.length} frames from R2`);
      } catch (cleanupErr: any) {
        console.warn(`⚠️ Failed to cleanup R2 frames: ${cleanupErr.message}`);
      }
    }
  } catch (error: any) {
    console.error(`❌ Job ${id} failed:`, error.message);
    await pool.query(
      `UPDATE jobs SET status = 'failed', error = $1, completed_at = NOW() WHERE id = $2`,
      [error.message, id]
    );
    
    // Cleanup: also delete video on failure (don't leave orphans)
    if (payload.videoKey) {
      try {
        await r2Client.send(new DeleteObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: payload.videoKey,
        }));
        console.log(`🗑️ Deleted video from R2 after failure: ${payload.videoKey}`);
      } catch (cleanupErr: any) {
        console.warn(`⚠️ Failed to cleanup R2 video: ${cleanupErr.message}`);
      }
    }
    
    // Cleanup: also delete frames on failure
    if (payload.frameKeys && payload.frameKeys.length > 0) {
      try {
        for (let i = 0; i < payload.frameKeys.length; i += 1000) {
          const batch = payload.frameKeys.slice(i, i + 1000);
          await r2Client.send(new DeleteObjectsCommand({
            Bucket: R2_BUCKET_NAME,
            Delete: {
              Objects: batch.map((key: string) => ({ Key: key })),
            },
          }));
        }
        console.log(`🗑️ Deleted ${payload.frameKeys.length} frames from R2 after failure`);
      } catch (cleanupErr: any) {
        console.warn(`⚠️ Failed to cleanup R2 frames: ${cleanupErr.message}`);
      }
    }
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
