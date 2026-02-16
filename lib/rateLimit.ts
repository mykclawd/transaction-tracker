import { clerkClient } from "@clerk/nextjs/server";

// Users with unlimited access (by Clerk user ID or email)
const UNLIMITED_USERS = new Set([
  "mykcryptodev@gmail.com",
  // Add Clerk user IDs here too if needed
]);

const DAILY_FRAME_LIMIT = 600;

interface UsageMetadata {
  framesProcessedToday?: number;
  lastUsageDate?: string; // ISO date string (YYYY-MM-DD)
}

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

export async function checkFrameLimit(
  userId: string,
  requestedFrames: number
): Promise<{ allowed: boolean; remaining: number; error?: string }> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  // Check if user has unlimited access
  const userEmail = user.emailAddresses[0]?.emailAddress;
  if (userEmail && UNLIMITED_USERS.has(userEmail)) {
    return { allowed: true, remaining: Infinity };
  }

  // Get current usage from metadata
  const metadata = (user.publicMetadata || {}) as UsageMetadata;
  const today = getTodayDate();

  // Reset count if it's a new day
  let currentUsage = 0;
  if (metadata.lastUsageDate === today) {
    currentUsage = metadata.framesProcessedToday || 0;
  }

  const remaining = DAILY_FRAME_LIMIT - currentUsage;

  if (requestedFrames > remaining) {
    return {
      allowed: false,
      remaining,
      error: `Daily limit exceeded. You have ${remaining} frames remaining today (limit: ${DAILY_FRAME_LIMIT}/day).`,
    };
  }

  return { allowed: true, remaining: remaining - requestedFrames };
}

export async function recordFrameUsage(
  userId: string,
  framesUsed: number
): Promise<void> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  // Check if user has unlimited access - don't track their usage
  const userEmail = user.emailAddresses[0]?.emailAddress;
  if (userEmail && UNLIMITED_USERS.has(userEmail)) {
    return;
  }

  const metadata = (user.publicMetadata || {}) as UsageMetadata;
  const today = getTodayDate();

  // Reset or increment based on date
  let newUsage = framesUsed;
  if (metadata.lastUsageDate === today) {
    newUsage = (metadata.framesProcessedToday || 0) + framesUsed;
  }

  await client.users.updateUserMetadata(userId, {
    publicMetadata: {
      ...metadata,
      framesProcessedToday: newUsage,
      lastUsageDate: today,
    },
  });
}
