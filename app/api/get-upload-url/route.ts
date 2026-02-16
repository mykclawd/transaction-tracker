import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "transaction-tracker";

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID || "",
    secretAccessKey: R2_SECRET_ACCESS_KEY || "",
  },
});

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if R2 is configured
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    console.error("R2 not configured:", { 
      hasAccountId: !!R2_ACCOUNT_ID, 
      hasAccessKey: !!R2_ACCESS_KEY_ID, 
      hasSecretKey: !!R2_SECRET_ACCESS_KEY 
    });
    return NextResponse.json(
      { error: "Storage not configured" },
      { status: 500 }
    );
  }

  try {
    const { filename, contentType, fileSize } = await request.json();
    
    if (!filename) {
      return NextResponse.json({ error: "Filename required" }, { status: 400 });
    }

    // Generate a consistent key based on userId + filename + fileSize for deduplication
    // This way, the same file uploaded twice will have the same key
    const dedupeKey = fileSize 
      ? `uploads/${userId}/${filename}-${fileSize}`
      : `uploads/${userId}/${Date.now()}-${filename}`; // Fallback if no fileSize provided
    
    // Check if file already exists in R2 (deduplication)
    if (fileSize) {
      try {
        const headCommand = new HeadObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: dedupeKey,
        });
        const existing = await s3Client.send(headCommand);
        
        // File exists and size matches - skip upload, return existing key
        if (existing.ContentLength === fileSize) {
          console.log(`♻️ Deduped: ${dedupeKey} (${fileSize} bytes already exists)`);
          return NextResponse.json({
            key: dedupeKey,
            deduplicated: true,
          });
        }
      } catch (headErr: any) {
        // File doesn't exist (404) - continue to generate presigned URL
        if (headErr.name !== 'NotFound' && headErr.$metadata?.httpStatusCode !== 404) {
          console.warn("HeadObject error (non-404):", headErr.message);
        }
      }
    }

    // Create presigned URL for PUT
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: dedupeKey,
      ContentType: contentType || "video/mp4",
    });
    
    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 }); // 5 min expiry
    
    console.log("Generated presigned URL for:", dedupeKey);
    
    // Return key so worker can download via S3 (no public URL needed)
    return NextResponse.json({
      presignedUrl,
      key: dedupeKey,
    });
  } catch (error: any) {
    console.error("Error generating presigned URL:", error);
    return NextResponse.json(
      { error: "Failed to generate upload URL: " + error.message },
      { status: 500 }
    );
  }
}
