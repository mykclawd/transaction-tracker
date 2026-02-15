import { Pool } from '@neondatabase/serverless';

// Create a connection pool
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL 
});

export { pool };

// Helper function to generate deterministic transaction ID
export function generateTransactionId(
  userId: string,
  merchantName: string,
  date: string,
  amount: number,
  rewards: number
): string {
  const data = `${userId}:${merchantName.toLowerCase().trim()}:${date}:${amount}:${rewards}`;
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Create a hex string from the hash and append data info for debugging
  const hashHex = Math.abs(hash).toString(16).padStart(8, '0');
  return `${hashHex}-${Buffer.from(data).toString('base64').slice(0, 20)}`;
}

// Helper to format date from various formats to ISO date string
export function parseTransactionDate(dateStr: string): string | null {
  // Try common date formats
  const formats = [
    // MM/DD/YYYY
    { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, fn: (m: RegExpMatchArray) => `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` },
    // MM-DD-YYYY
    { regex: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, fn: (m: RegExpMatchArray) => `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` },
    // YYYY-MM-DD
    { regex: /^(\d{4})-(\d{1,2})-(\d{1,2})$/, fn: (m: RegExpMatchArray) => `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` },
    // Jan 15, 2024 or January 15, 2024
    { regex: /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/, fn: (m: RegExpMatchArray) => {
      const months: Record<string, string> = {
        'jan': '01', 'january': '01',
        'feb': '02', 'february': '02',
        'mar': '03', 'march': '03',
        'apr': '04', 'april': '04',
        'may': '05',
        'jun': '06', 'june': '06',
        'jul': '07', 'july': '07',
        'aug': '08', 'august': '08',
        'sep': '09', 'sept': '09', 'september': '09',
        'oct': '10', 'october': '10',
        'nov': '11', 'november': '11',
        'dec': '12', 'december': '12',
      };
      const month = months[m[1].toLowerCase()];
      if (!month) return null;
      return `${m[3]}-${month}-${m[2].padStart(2, '0')}`;
    }},
  ];

  for (const format of formats) {
    const match = dateStr.match(format.regex);
    if (match) {
      const result = format.fn(match);
      if (result) return result;
    }
  }

  return null;
}

// Predefined categories for transactions
export const TRANSACTION_CATEGORIES = [
  'Food & Dining',
  'Shopping',
  'Entertainment',
  'Transportation',
  'Travel',
  'Utilities',
  'Healthcare',
  'Education',
  'Business',
  'Other',
] as const;

// Get user-specific category for a merchant (returns null if no override)
export async function getUserMerchantCategory(
  userId: string,
  merchantName: string
): Promise<string | null> {
  const result = await pool.query(
    `SELECT category FROM user_merchant_categories 
     WHERE user_id = $1 AND LOWER(merchant_name) = LOWER($2)`,
    [userId, merchantName]
  );
  return result.rows[0]?.category || null;
}

// Set user-specific category for a merchant
export async function setUserMerchantCategory(
  userId: string,
  merchantName: string,
  category: string,
  source: 'manual' | 'auto' = 'manual'
): Promise<void> {
  await pool.query(
    `INSERT INTO user_merchant_categories (user_id, merchant_name, category, source, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id, merchant_name) 
     DO UPDATE SET category = $3, source = $4, updated_at = NOW()`,
    [userId, merchantName, category, source]
  );
}

// Delete user-specific category override
export async function deleteUserMerchantCategory(
  userId: string,
  merchantName: string
): Promise<void> {
  await pool.query(
    `DELETE FROM user_merchant_categories 
     WHERE user_id = $1 AND LOWER(merchant_name) = LOWER($2)`,
    [userId, merchantName]
  );
}
