import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const frames = body.frames || [];
    const video = body.video; // Legacy support

    if (!frames.length && !video) {
      return NextResponse.json(
        { error: "No frames or video provided" },
        { status: 400 }
      );
    }

    // Create a job with frames (preferred) or video (legacy)
    const payload = frames.length > 0 ? { frames } : { video };
    
    const result = await pool.query(
      `INSERT INTO jobs (user_id, type, payload, status)
       VALUES ($1, 'video_extract', $2, 'pending')
       RETURNING id`,
      [userId, JSON.stringify(payload)]
    );

    const jobId = result.rows[0].id;

    // Trigger the worker immediately (don't wait for cron)
    // Use the request origin to call the same deployment
    try {
      const origin = request.headers.get('origin') || request.headers.get('host');
      const protocol = origin?.includes('localhost') ? 'http' : 'https';
      const baseUrl = origin ? `${protocol}://${origin.replace(/^https?:\/\//, '')}` : '';
      
      if (baseUrl) {
        // Fire and forget - don't await to avoid blocking response
        fetch(`${baseUrl}/api/worker`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }).catch((e) => console.error('Worker trigger failed:', e));
      }
    } catch (e) {
      console.error('Worker trigger error:', e);
    }

    return NextResponse.json({
      jobId,
      status: "pending",
      message: "Upload successful! Processing will take 1-2 minutes."
    });
  } catch (error) {
    console.error("Error creating job:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create job" },
      { status: 500 }
    );
  }
}
