import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL 
});

async function clearAllData() {
  try {
    console.log('⚠️  Clearing ALL transactions and jobs...');
    
    // Delete all transactions
    const txResult = await pool.query('DELETE FROM transactions RETURNING COUNT(*)');
    console.log(`✅ Deleted ${txResult.rowCount} transactions`);
    
    // Delete all jobs
    const jobResult = await pool.query('DELETE FROM jobs RETURNING COUNT(*)');
    console.log(`✅ Deleted ${jobResult.rowCount} jobs`);
    
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
