import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_R1xfXya7Nerh@ep-tiny-rain-aip5f9ls-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require'
});

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
    
    console.log('✅ merchant_categories (global cache) table created');
    
    // Add index for faster lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_merchant_categories_lookup 
      ON merchant_categories(LOWER(merchant_name))
    `);
    
    console.log('✅ Index created');
    
    // Also create user_merchant_categories if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_merchant_categories (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        merchant_name TEXT NOT NULL,
        category TEXT NOT NULL,
        source TEXT DEFAULT 'manual',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, merchant_name)
      )
    `);
    
    console.log('✅ user_merchant_categories table created');
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_merchant_categories_lookup 
      ON user_merchant_categories(user_id, merchant_name)
    `);
    
    console.log('✅ User merchant index created');
    console.log('✅ Migration complete!');
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await pool.end();
    process.exit(1);
  }
}

setupGlobalMerchantCache();
