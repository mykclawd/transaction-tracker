import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { pool, generateTransactionId, parseTransactionDate, getUserMerchantCategory, getGlobalMerchantCategory, setGlobalMerchantCategory } from "@/lib/db";
import { getMerchantCategory, categorizeByCommonName } from "@/lib/places";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const placesApiKey = process.env.GOOGLE_PLACES_API_KEY;

const BATCH_SIZE = 10; // Frames per API call

interface Transaction {
  merchant_name: string;
  transaction_date: string;
  amount_spent: number;
  bitcoin_rewards: number;
}

// Retry helper for rate limit errors
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const isRateLimit = error?.status === 429 || error?.message?.includes('429');
      
      if (isRateLimit && attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.log(`Rate limited, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

async function extractTransactionsFromBatch(frames: string[]): Promise<Transaction[]> {
  const content: any[] = [
    {
      type: "text",
      text: `Extract ALL credit card transactions visible in these ${frames.length} video frames. Count carefully and extract every single one.`,
    },
  ];

  for (const frame of frames) {
    content.push({
      type: "image_url",
      image_url: { url: frame, detail: "high" },
    });
  }

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
  {"merchant_name": "Starbucks", "transaction_date": "01/15/2024", "amount_spent": 5.67, "bitcoin_rewards": 1.23}
]`,
      },
      { role: "user", content },
    ],
    max_tokens: 8000,
  }));

  const responseContent = response.choices[0].message.content;
  if (!responseContent) return [];

  // Parse JSON from response
  let cleanedContent = responseContent.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const jsonMatch = cleanedContent.match(/\[[\s\S]*\]/);
  
  if (!jsonMatch) {
    if (responseContent.toLowerCase().includes("no transaction")) return [];
    console.warn("Could not parse response:", responseContent.substring(0, 200));
    return [];
  }

  try {
    return JSON.parse(jsonMatch[0]) as Transaction[];
  } catch (e) {
    console.warn("JSON parse error:", e);
    return [];
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { frames } = await request.json();
    
    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      return NextResponse.json({ error: "No frames provided" }, { status: 400 });
    }

    console.log(`📸 Processing ${frames.length} frames in batches of ${BATCH_SIZE}...`);
    
    // Process frames in batches
    const batches: string[][] = [];
    for (let i = 0; i < frames.length; i += BATCH_SIZE) {
      batches.push(frames.slice(i, i + BATCH_SIZE));
    }

    console.log(`📦 Split into ${batches.length} batches`);

    // Process all batches (can be parallelized, but sequential is safer for rate limits)
    const allTransactions: Transaction[] = [];
    for (let i = 0; i < batches.length; i++) {
      console.log(`🔍 Processing batch ${i + 1}/${batches.length}...`);
      const batchTransactions = await extractTransactionsFromBatch(batches[i]);
      allTransactions.push(...batchTransactions);
      console.log(`   Found ${batchTransactions.length} transactions in batch ${i + 1}`);
    }

    console.log(`📊 Total raw transactions: ${allTransactions.length}`);

    // Deduplicate and insert into database
    let added = 0;
    let duplicates = 0;
    const seenIds = new Set<string>();

    for (const t of allTransactions) {
      const formattedDate = parseTransactionDate(t.transaction_date);
      if (!formattedDate) continue;

      const transactionId = generateTransactionId(
        userId,
        t.merchant_name,
        formattedDate,
        t.amount_spent,
        t.bitcoin_rewards || 0
      );

      // Skip if we've already seen this in current batch
      if (seenIds.has(transactionId)) {
        duplicates++;
        continue;
      }
      seenIds.add(transactionId);

      // Get category
      let category = await getUserMerchantCategory(userId, t.merchant_name);
      if (!category) category = await getGlobalMerchantCategory(t.merchant_name);
      if (!category) {
        category = categorizeByCommonName(t.merchant_name);
        if (category) await setGlobalMerchantCategory(t.merchant_name, category, 'common_name');
      }
      if (!category && placesApiKey) {
        category = await getMerchantCategory(t.merchant_name, placesApiKey);
        if (category) await setGlobalMerchantCategory(t.merchant_name, category, 'google_places');
      }

      try {
        await pool.query(
          `INSERT INTO transactions (id, user_id, merchant_name, transaction_date, amount_spent, bitcoin_rewards, category)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO NOTHING`,
          [transactionId, userId, t.merchant_name, formattedDate, t.amount_spent, t.bitcoin_rewards || 0, category]
        );
        added++;
      } catch (err: any) {
        if (err.code === "23505") duplicates++;
        else throw err;
      }
    }

    const totalRewards = allTransactions.reduce((sum, t) => sum + (Number(t.bitcoin_rewards) || 0), 0);

    console.log(`✅ Complete: ${added} added, ${duplicates} duplicates, $${totalRewards.toFixed(2)} in rewards`);

    return NextResponse.json({
      success: true,
      added,
      duplicates,
      totalExtracted: allTransactions.length,
      totalBitcoinRewards: totalRewards,
    });

  } catch (error: any) {
    console.error("Process frames error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
