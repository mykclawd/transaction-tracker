import { pool } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get recent jobs for this user (last 24 hours)
    const result = await pool.query(
      `SELECT id, status, created_at, completed_at, error 
       FROM jobs 
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );

    return NextResponse.json({ 
      jobs: result.rows,
      pending: result.rows.filter(j => j.status === "pending").length,
      processing: result.rows.filter(j => j.status === "processing").length,
      completed: result.rows.filter(j => j.status === "completed").length,
      failed: result.rows.filter(j => j.status === "failed").length,
    });
  } catch (error: any) {
    console.error("Job status error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
