// Client-side video frame extraction utility

export interface FrameExtractionOptions {
  framesPerSecond?: number;  // How many frames per second (default: 1)
  maxFrames?: number;        // Maximum frames to extract (default: 120)
  maxWidth?: number;         // Max width of frames (default: 800)
  quality?: number;          // JPEG quality 0-1 (default: 0.6)
  onProgress?: (progress: number, message: string) => void;
}

export async function extractFramesFromVideo(
  file: File,
  options: FrameExtractionOptions = {}
): Promise<string[]> {
  const {
    framesPerSecond = 1,
    maxFrames = 120,
    maxWidth = 800,
    quality = 0.6,
    onProgress,
  } = options;

  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      reject(new Error("Could not get canvas context"));
      return;
    }

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    video.onloadedmetadata = async () => {
      const duration = video.duration;
      const frameInterval = 1 / framesPerSecond;
      const totalPossibleFrames = Math.floor(duration * framesPerSecond);
      const framesToExtract = Math.min(totalPossibleFrames, maxFrames);

      // Calculate dimensions maintaining aspect ratio
      const aspectRatio = video.videoWidth / video.videoHeight;
      const width = Math.min(video.videoWidth, maxWidth);
      const height = Math.round(width / aspectRatio);

      canvas.width = width;
      canvas.height = height;

      onProgress?.(5, `Extracting ${framesToExtract} frames from ${duration.toFixed(1)}s video...`);

      const frames: string[] = [];
      
      for (let i = 0; i < framesToExtract; i++) {
        const time = i * frameInterval;
        
        try {
          // Seek to the specific time
          video.currentTime = time;
          await new Promise<void>((res) => {
            video.onseeked = () => res();
          });

          // Draw the frame
          ctx.drawImage(video, 0, 0, width, height);
          
          // Convert to data URL
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          frames.push(dataUrl);

          // Report progress (5-80% for extraction)
          const progress = 5 + Math.round((i / framesToExtract) * 75);
          onProgress?.(progress, `Extracted frame ${i + 1}/${framesToExtract}`);
        } catch (err) {
          console.warn(`Failed to extract frame at ${time}s:`, err);
        }
      }

      URL.revokeObjectURL(objectUrl);
      
      onProgress?.(80, `Extracted ${frames.length} frames`);
      resolve(frames);
    };

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load video"));
    };
  });
}
