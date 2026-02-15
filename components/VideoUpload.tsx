"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Loader2, X, FileVideo, Check, Image, Send, Brain } from "lucide-react";

interface VideoUploadProps {
  onUploadComplete: () => void;
}

type ProcessingStep = "idle" | "extracting" | "uploading" | "processing" | "completed" | "failed";

interface StepInfo {
  step: ProcessingStep;
  progress: number;
  message: string;
}

export function VideoUpload({ onUploadComplete }: VideoUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [stepInfo, setStepInfo] = useState<StepInfo>({ step: "idle", progress: 0, message: "" });
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobResult, setJobResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Poll for job status when processing
  useEffect(() => {
    if (!jobId || stepInfo.step === "completed" || stepInfo.step === "failed") {
      return;
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`);
        if (!response.ok) throw new Error("Failed to fetch job status");
        
        const data = await response.json();
        
        if (data.status === "completed") {
          setJobResult(data.result);
          setStepInfo({ 
            step: "completed", 
            progress: 100, 
            message: `Added ${data.result?.added || 0} transactions, skipped ${data.result?.duplicates || 0} duplicates` 
          });
          onUploadComplete();
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
        } else if (data.status === "failed") {
          setError(data.error || "Processing failed");
          setStepInfo({ step: "failed", progress: 0, message: data.error || "Processing failed" });
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
        } else if (data.status === "processing") {
          setStepInfo({ step: "processing", progress: 75, message: "AI analyzing transactions... this can take a few minutes. You can leave and come back later." });
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 2000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [jobId, stepInfo.step, onUploadComplete]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      if (!selected.type.startsWith("video/")) {
        setError("Please select a video file");
        return;
      }
      if (selected.size > 500 * 1024 * 1024) {
        setError("Video must be under 500MB");
        return;
      }
      setFile(selected);
      setError(null);
      resetState();
    }
  };

  const resetState = () => {
    setJobId(null);
    setJobResult(null);
    setStepInfo({ step: "idle", progress: 0, message: "" });
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
  };

  // Extract frames from video using canvas
  const extractFrames = async (file: File): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      
      const url = URL.createObjectURL(file);
      video.src = url;

      video.onloadedmetadata = async () => {
        const duration = video.duration;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error("Failed to get canvas context"));
          return;
        }

        // Resize to smaller dimensions (max 800px wide) to reduce payload
        const scale = Math.min(1, 800 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);

        // Extract fewer frames (max 12) to stay under payload limits
        // 12 frames at ~100KB each = ~1.2MB total (safe for Vercel's 4.5MB limit)
        const frameInterval = Math.max(3, duration / 12);
        const frameCount = Math.min(12, Math.ceil(duration / frameInterval));
        const frames: string[] = [];

        const captureFrame = (time: number): Promise<string> => {
          return new Promise((res) => {
            video.currentTime = time;
            video.onseeked = () => {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              // Use JPEG with 60% quality to reduce size (still readable for text)
              const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
              res(dataUrl);
            };
          });
        };

        try {
          for (let i = 0; i < frameCount; i++) {
            const time = i * frameInterval;
            setStepInfo({ 
              step: "extracting", 
              progress: Math.round((i / frameCount) * 25), 
              message: `Extracting frame ${i + 1} of ${frameCount}...` 
            });
            const frame = await captureFrame(time);
            frames.push(frame);
          }
          URL.revokeObjectURL(url);
          resolve(frames);
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };

      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load video"));
      };
    });
  };

  const handleUpload = async () => {
    if (!file) return;

    setError(null);
    resetState();

    try {
      // Step 1: Extract frames
      setStepInfo({ step: "extracting", progress: 5, message: "Loading video..." });
      const frames = await extractFrames(file);
      
      // Step 2: Upload frames
      const payload = JSON.stringify({ frames });
      const payloadSizeMB = (payload.length / 1024 / 1024).toFixed(2);
      setStepInfo({ step: "uploading", progress: 30, message: `Uploading ${frames.length} frames (${payloadSizeMB}MB)...` });
      
      // Check payload size before sending (Vercel limit is ~4.5MB)
      if (payload.length > 4 * 1024 * 1024) {
        throw new Error(`Payload too large (${payloadSizeMB}MB). Try a shorter video.`);
      }
      
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });

      if (!response.ok) {
        let errorMessage = "Failed to create job";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setJobId(data.jobId);
      
      // Step 3: Processing
      setStepInfo({ step: "processing", progress: 50, message: "AI analyzing transactions... this can take a few minutes. You can leave and come back later." });
      
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(message);
      setStepInfo({ step: "failed", progress: 0, message });
    }
  };

  const clearFile = () => {
    setFile(null);
    resetState();
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const isProcessing = ["extracting", "uploading", "processing"].includes(stepInfo.step);

  const steps = [
    { id: "extracting", label: "Extract Frames", icon: Image },
    { id: "uploading", label: "Upload", icon: Send },
    { id: "processing", label: "AI Analysis", icon: Brain },
    { id: "completed", label: "Done", icon: Check },
  ];

  const getStepStatus = (stepId: string) => {
    const stepOrder = ["extracting", "uploading", "processing", "completed"];
    const currentIndex = stepOrder.indexOf(stepInfo.step);
    const stepIndex = stepOrder.indexOf(stepId);
    
    if (stepInfo.step === "failed") return "failed";
    if (stepIndex < currentIndex) return "complete";
    if (stepIndex === currentIndex) return "current";
    return "pending";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Transaction Video</CardTitle>
        <CardDescription>
          Upload a video of your credit card transactions. We&apos;ll extract frames
          and use AI to read the merchant, date, amount, and bitcoin rewards.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* File Input */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            className="hidden"
            id="video-upload"
            disabled={isProcessing}
          />
          <label
            htmlFor="video-upload"
            className={`flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-zinc-300 p-4 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600 ${
              isProcessing ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {file ? (
              <>
                <FileVideo className="h-5 w-5 text-green-500" />
                <span className="text-sm font-medium">{file.name}</span>
                <span className="text-xs text-zinc-500">
                  ({(file.size / 1024 / 1024).toFixed(1)} MB)
                </span>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    clearFile();
                  }}
                  className="ml-2 rounded-full p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  disabled={isProcessing}
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <Upload className="h-5 w-5" />
                <span className="text-sm font-medium">
                  {stepInfo.step === "completed" ? "Upload another video" : "Select video file"}
                </span>
              </>
            )}
          </label>
          {file && (
            <Button onClick={handleUpload} disabled={isProcessing} className="w-full sm:w-auto">
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Upload & Process"
              )}
            </Button>
          )}
        </div>

        {/* Progress Steps */}
        {stepInfo.step !== "idle" && (
          <div className="space-y-4">
            {/* Step Indicators */}
            <div className="flex items-center justify-between">
              {steps.map((step, index) => {
                const status = getStepStatus(step.id);
                const Icon = step.icon;
                return (
                  <div key={step.id} className="flex flex-1 items-center">
                    <div className="flex flex-col items-center">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all ${
                          status === "complete"
                            ? "border-green-500 bg-green-500 text-white"
                            : status === "current"
                            ? "border-blue-500 bg-blue-50 text-blue-500 dark:bg-blue-950"
                            : status === "failed"
                            ? "border-red-500 bg-red-50 text-red-500 dark:bg-red-950"
                            : "border-zinc-300 bg-zinc-50 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
                        }`}
                      >
                        {status === "current" && step.id !== "completed" ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Icon className="h-5 w-5" />
                        )}
                      </div>
                      <span
                        className={`mt-2 text-xs font-medium ${
                          status === "complete"
                            ? "text-green-600 dark:text-green-400"
                            : status === "current"
                            ? "text-blue-600 dark:text-blue-400"
                            : status === "failed"
                            ? "text-red-600 dark:text-red-400"
                            : "text-zinc-400"
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                    {index < steps.length - 1 && (
                      <div
                        className={`mx-2 h-0.5 flex-1 ${
                          getStepStatus(steps[index + 1].id) !== "pending"
                            ? "bg-green-500"
                            : "bg-zinc-200 dark:bg-zinc-700"
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                <div
                  className={`h-full transition-all duration-300 ${
                    stepInfo.step === "failed"
                      ? "bg-red-500"
                      : stepInfo.step === "completed"
                      ? "bg-green-500"
                      : "bg-blue-500"
                  }`}
                  style={{ width: `${stepInfo.progress}%` }}
                />
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{stepInfo.message}</p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        )}

        {/* Success Result */}
        {stepInfo.step === "completed" && jobResult && (
          <div className="rounded-lg bg-green-50 p-4 dark:bg-green-950">
            <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
              <Check className="h-5 w-5" />
              <span className="font-medium">Processing Complete!</span>
            </div>
            <p className="mt-2 text-sm text-green-700 dark:text-green-300">
              Added {jobResult.added || 0} new transactions
              {jobResult.duplicates > 0 && `, skipped ${jobResult.duplicates} duplicates`}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
