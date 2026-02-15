import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL 
});

async function clearAllData() {
  try {
    console.log('⚠️  Clearing ALL transactions and jobs...');
    
    // Get counts before deletion
    const txCountBefore = await pool.query('SELECT COUNT(*) FROM transactions');
    const jobCountBefore = await pool.query('SELECT COUNT(*) FROM jobs');
    
    // Delete all transactions
    await pool.query('DELETE FROM transactions');
    console.log(`✅ Deleted ${txCountBefore.rows[0].count} transactions`);
    
    // Delete all jobs
    await pool.query('DELETE FROM jobs');
    console.log(`✅ Deleted ${jobCountBefore.rows[0].count} jobs`);
    
    // Reset merchant categories (optional - keeps learned categories)
    // Uncomment if you want to clear categories too:
    // await pool.query('DELETE FROM merchant_categories');
    // console.log('✅ Deleted merchant categories');
    
    console.log('\n🎉 Database cleared! Ready for fresh testing.');
    
  } catch (err: any) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

clearAllData();
