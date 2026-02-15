import { pool } from '../lib/db';

async function setupGlobalMerchantCache() {
  try {
    // Create table for global merchant category cache (from Google Places)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS merchant_categories (
        id SERIAL PRIMARY KEY,
        merchant_name TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL,
        source TEXT DEFAULT 'google_places',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Add index for faster lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_merchant_categories_lookup 
      ON merchant_categories(LOWER(merchant_name))
    `);
    
    console.log('✅ merchant_categories (global cache) table created');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

setupGlobalMerchantCache();
