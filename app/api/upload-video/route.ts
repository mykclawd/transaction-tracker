import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get the video file directly from FormData
    const formData = await request.formData();
    const videoFile = formData.get('video') as File;

    if (!videoFile) {
      return NextResponse.json(
        { error: "No video provided" },
        { status: 400 }
      );
    }

    // Read the file as base64
    const bytes = await videoFile.arrayBuffer();
    const base64Video = Buffer.from(bytes).toString('base64');

    // Create a single job with the video
    const result = await pool.query(
      `INSERT INTO jobs (user_id, type, payload, status)
       VALUES ($1, 'video_extract', $2, 'pending')
       RETURNING id`,
      [userId, JSON.stringify({ video: base64Video, filename: videoFile.name })]
    );

    const jobId = result.rows[0].id;

    // Trigger worker immediately
    try {
      const origin = request.headers.get('origin') || request.headers.get('host');
      const protocol = origin?.includes('localhost') ? 'http' : 'https';
      const baseUrl = origin ? `${protocol}://${origin.replace(/^https?:\/\//, '')}` : '';
      
      if (baseUrl) {
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
      message: "Video uploading! Processing will take 2-3 minutes."
    });
  } catch (error) {
    console.error("Error creating job:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload video" },
      { status: 500 }
    );
  }
}

// Route segment config for Next.js App Router
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for Pro plan
