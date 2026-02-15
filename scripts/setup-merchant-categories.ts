import { pool } from '../lib/db';

async function setupMerchantCategories() {
  try {
    // Create table for user-specific merchant category overrides
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_merchant_categories (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        merchant_name TEXT NOT NULL,
        category TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, merchant_name)
      )
    `);
    
    // Add index for faster lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_merchant_categories_lookup 
      ON user_merchant_categories(user_id, merchant_name)
    `);
    
    console.log('✅ user_merchant_categories table created');
    
    // Add source column to track if category is auto-detected or manual
    await pool.query(`
      ALTER TABLE user_merchant_categories 
      ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'
    `);
    
    console.log('✅ Migration complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

setupMerchantCategories();
