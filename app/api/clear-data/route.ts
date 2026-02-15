import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Delete all transactions for this user
    const txResult = await pool.query(
      'DELETE FROM transactions WHERE user_id = $1 RETURNING COUNT(*)',
      [userId]
    );
    
    // Delete all jobs for this user
    const jobResult = await pool.query(
      'DELETE FROM jobs WHERE user_id = $1 RETURNING COUNT(*)',
      [userId]
    );

    return NextResponse.json({ 
      success: true, 
      deleted: {
        transactions: txResult.rowCount,
        jobs: jobResult.rowCount
      }
    });
  } catch (error) {
    console.error("Error clearing data:", error);
    return NextResponse.json(
      { error: "Failed to clear data" },
      { status: 500 }
    );
  }
}
