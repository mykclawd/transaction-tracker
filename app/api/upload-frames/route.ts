import { auth } from "@clerk/nextjs/server";
import { pool } from "@/lib/db";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "transaction-tracker";

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID || "",
    secretAccessKey: R2_SECRET_ACCESS_KEY || "",
  },
});

// Handle preflight requests
export async function OPTIONS() {
  return new Response(null, { status: 200 });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { frames } = await request.json();

    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      return Response.json({ error: "No frames provided" }, { status: 400 });
    }

    console.log(`📤 Uploading ${frames.length} frames to R2 for user ${userId}`);
    const startTime = Date.now();

    // Generate a unique job prefix
    const jobPrefix = `frames/${userId}/${randomUUID()}`;
    const frameKeys: string[] = [];

    // Upload all frames to R2 in parallel
    await Promise.all(
      frames.map(async (frame: string, index: number) => {
        const key = `${jobPrefix}/frame-${String(index).padStart(4, "0")}.jpg`;
        
        // Extract base64 data from data URL
        const base64Data = frame.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");

        await r2Client.send(
          new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: "image/jpeg",
          })
        );

        frameKeys.push(key);
      })
    );

    console.log(`✅ Uploaded ${frameKeys.length} frames in ${Date.now() - startTime}ms`);

    // Create job with frame keys
    const result = await pool.query(
      `INSERT INTO jobs (user_id, status, payload) VALUES ($1, 'pending', $2) RETURNING id`,
      [userId, JSON.stringify({ frameKeys, frameCount: frameKeys.length })]
    );

    const jobId = result.rows[0].id;
    console.log(`📋 Created job ${jobId} with ${frameKeys.length} frames`);

    return Response.json({
      jobId,
      frameCount: frameKeys.length,
      message: "Frames uploaded, processing queued",
    });
  } catch (error: any) {
    console.error("Upload frames error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
