import { pool, generateTransactionId, parseTransactionDate, getUserMerchantCategory, getGlobalMerchantCategory, setGlobalMerchantCategory } from "@/lib/db";
import { categorizeByCommonName } from "@/lib/places";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
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

// Retry helper for rate limit errors
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
  baseDelayMs: number = 2000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      const isRateLimit = error?.status === 429 || 
                          error?.message?.includes('429') ||
                          error?.message?.includes('rate limit') ||
                          error?.message?.includes('quota');
      
      if (isRateLimit && attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.log(`Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError;
}

async function extractTransactionsFromFrames(frames: string[]): Promise<Transaction[]> {
  const content: any[] = [
    {
      type: "text",
      text: "Extract all credit card transactions visible in these video frames. Ignore any pending transactions and 'Payment made' entries. Return ONLY a valid JSON array.",
    },
  ];

  for (const frame of frames) {
    content.push({
      type: "image_url",
      image_url: {
        url: frame,
        detail: "high",
      },
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
- transaction_date (format MM/DD/YYYY) - convert any date format
- amount_spent (number) - the dollar amount spent
- bitcoin_rewards (number) - the USDC value in the "BTC Rewards" column (NOT BTC amount, but the USDC equivalent shown)

CRITICAL RULES:
1. EXTRACT EVERY TRANSACTION YOU SEE - do not skip any
2. IGNORE any transactions marked as "pending" or "Pending"
3. IGNORE "Payment made" or "Payment received" entries
4. Deduplicate: same transaction in multiple frames = include ONCE
5. BTC Rewards column shows USDC value (e.g., "$1.23") - extract the number

Return ONLY a valid JSON array. Example:
[{"merchant_name": "Starbucks", "transaction_date": "01/15/2024", "amount_spent": 5.67, "bitcoin_rewards": 1.23}]`,
      },
      {
        role: "user",
        content,
      },
    ],
    max_tokens: 8000,
  }));

  const responseContent = response.choices[0].message.content;
  if (!responseContent) return [];

  let cleanedContent = responseContent.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const jsonMatch = cleanedContent.match(/\[[\s\S]*\]/);
  
  if (!jsonMatch) {
    if (responseContent.toLowerCase().includes("no transaction")) return [];
    console.error("Failed to parse:", responseContent.substring(0, 200));
    return [];
  }

  try {
    return JSON.parse(jsonMatch[0]) as Transaction[];
  } catch {
    // Try to fix truncated JSON
    let depth = 0, lastComplete = -1, inString = false, escaped = false;
    const jsonStr = jsonMatch[0];
    
    for (let i = 0; i < jsonStr.length; i++) {
      const char = jsonStr[i];
      if (escaped) { escaped = false; continue; }
      if (char === '\\' && inString) { escaped = true; continue; }
      if (char === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (char === '[' || char === '{') depth++;
      else if (char === ']' || char === '}') {
        depth--;
        if (depth === 1 && char === '}') lastComplete = i;
      }
    }
    
    if (lastComplete > 0) {
      try {
        return JSON.parse(jsonStr.substring(0, lastComplete + 1) + ']') as Transaction[];
      } catch { /* ignore */ }
    }
    return [];
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { frames } = await request.json();
    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      return NextResponse.json({ error: "No frames provided" }, { status: 400 });
    }

    // Extract transactions
    const rawTransactions = await extractTransactionsFromFrames(frames);
    
    // Save to database
    let created = 0;
    for (const t of rawTransactions) {
      const parsedDate = parseTransactionDate(t.transaction_date);
      if (!parsedDate) continue;

      const id = generateTransactionId(userId, t.merchant_name, parsedDate, t.amount_spent);
      
      // Get category
      let category = await getUserMerchantCategory(userId, t.merchant_name);
      if (!category) category = await getGlobalMerchantCategory(t.merchant_name);
      if (!category) {
        category = categorizeByCommonName(t.merchant_name);
        if (category) await setGlobalMerchantCategory(t.merchant_name, category, 'common_name');
      }

      try {
        await pool.query(
          `INSERT INTO transactions (id, user_id, merchant_name, transaction_date, amount_spent, bitcoin_rewards, category)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO NOTHING`,
          [id, userId, t.merchant_name, parsedDate, t.amount_spent, t.bitcoin_rewards, category]
        );
        created++;
      } catch (err) {
        console.error("Insert error:", err);
      }
    }

    return NextResponse.json({ 
      success: true, 
      transactionsFound: rawTransactions.length,
      transactionsCreated: created 
    });
    
  } catch (error: any) {
    console.error("Process batch error:", error);
    return NextResponse.json({ 
      error: error.message || "Failed to process batch" 
    }, { status: 500 });
  }
}
