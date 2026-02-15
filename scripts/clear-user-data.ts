import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL 
});

async function clearUserData(userId: string) {
  try {
    // Delete user's transactions
    const txResult = await pool.query(
      'DELETE FROM transactions WHERE user_id = $1 RETURNING COUNT(*)',
      [userId]
    );
    
    // Delete user's jobs
    const jobResult = await pool.query(
      'DELETE FROM jobs WHERE user_id = $1 RETURNING COUNT(*)',
      [userId]
    );
    
    console.log(`✅ Cleared ${txResult.rowCount} transactions and ${jobResult.rowCount} jobs for user ${userId}`);
  } catch (err: any) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Get user ID from command line
const userId = process.argv[2];
if (!userId) {
  console.error('Usage: npx tsx scripts/clear-user-data.ts <user_id>');
  console.error('Your user ID can be found in the Clerk dashboard or browser dev tools');
  process.exit(1);
}

clearUserData(userId);
