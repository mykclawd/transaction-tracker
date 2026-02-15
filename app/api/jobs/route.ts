import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { video } = await request.json();

    if (!video) {
      return NextResponse.json(
        { error: "No video provided" },
        { status: 400 }
      );
    }

    // Create a job
    const result = await pool.query(
      `INSERT INTO jobs (user_id, type, payload, status)
       VALUES ($1, 'video_extract', $2, 'pending')
       RETURNING id`,
      [userId, JSON.stringify({ video })]
    );

    const jobId = result.rows[0].id;

    return NextResponse.json({
      jobId,
      status: "pending",
      message: "Video upload successful! Processing will take 1-2 minutes. You can check back or wait for the transactions to appear."
    });
  } catch (error) {
    console.error("Error creating job:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create job" },
      { status: 500 }
    );
  }
}
