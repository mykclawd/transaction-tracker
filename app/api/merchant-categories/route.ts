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
      `SELECT merchant_name, category, source, created_at 
       FROM user_merchant_categories 
       WHERE user_id = $1 
       ORDER BY updated_at DESC`,
      [userId]
    );

    return NextResponse.json({ categories: result.rows });
  } catch (error) {
    console.error("Error fetching merchant categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch merchant categories" },
      { status: 500 }
    );
  }
}
