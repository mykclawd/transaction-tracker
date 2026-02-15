import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await pool.query(
      `SELECT * FROM transactions 
       WHERE user_id = $1 
       ORDER BY transaction_date DESC, created_at DESC`,
      [userId]
    );

    return NextResponse.json({ transactions: result.rows });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}
