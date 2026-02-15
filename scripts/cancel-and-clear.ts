import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL 
});

async function cancelAndClear() {
  try {
    // Cancel any pending or processing jobs
    const cancelResult = await pool.query(
      `UPDATE jobs 
       SET status = 'cancelled', 
           completed_at = NOW(),
           error = 'Cancelled by user'
       WHERE status IN ('pending', 'processing')
       RETURNING id, status`
    );
    console.log(`🚫 Cancelled ${cancelResult.rowCount} active jobs`);
    
    // Get counts before deletion
    const txCountBefore = await pool.query('SELECT COUNT(*) FROM transactions');
    const jobsCount = await pool.query('SELECT COUNT(*) FROM jobs');
    
    // Delete all transactions
    await pool.query('DELETE FROM transactions');
    console.log(`✅ Deleted ${txCountBefore.rows[0].count} transactions`);
    
    // Delete all jobs
    await pool.query('DELETE FROM jobs');
    console.log(`✅ Deleted ${jobsCount.rows[0].count} jobs`);
    
    console.log('\n🎉 All cleared! Ready for fresh testing.');
    
  } catch (err: any) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

cancelAndClear();
