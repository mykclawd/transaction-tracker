"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Loader2, X, FileVideo, RefreshCw } from "lucide-react";
import { VideoProcessResult } from "@/lib/types";

interface VideoUploadProps {
  onUploadComplete: () => void;
}

export function VideoUpload({ onUploadComplete }: VideoUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [jobResult, setJobResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Poll for job status
  useEffect(() => {
    if (!jobId || jobStatus === "completed" || jobStatus === "failed") {
      return;
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`);
        if (!response.ok) throw new Error("Failed to fetch job status");
        
        const data = await response.json();
        setJobStatus(data.status);
        
        if (data.status === "completed") {
          setJobResult(data.result);
          onUploadComplete();
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
        } else if (data.status === "failed") {
          setError(data.error || "Processing failed");
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 3000); // Poll every 3 seconds

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [jobId, jobStatus, onUploadComplete]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      if (!selected.type.startsWith("video/")) {
        setError("Please select a video file");
        return;
      }
      if (selected.size > 100 * 1024 * 1024) {
        setError("Video must be under 100MB");
        return;
      }
      setFile(selected);
      setError(null);
      resetJobState();
    }
  };

  const resetJobState = () => {
    setJobId(null);
    setJobStatus(null);
    setJobResult(null);
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    resetJobState();

    try {
      const base64 = await fileToBase64(file);
      
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video: base64 }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create job");
      }

      const data = await response.json();
      setJobId(data.jobId);
      setJobStatus("pending");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const clearFile = () => {
    setFile(null);
    resetJobState();
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const getStatusMessage = () => {
    switch (jobStatus) {
      case "pending":
        return "⏳ Upload complete! Waiting to start processing...";
      case "processing":
        return "🤖 AI is analyzing your video and extracting transactions... (this takes 1-2 minutes)";
      case "completed":
        return `✅ Processing complete! Added ${jobResult?.added || 0} new transactions, skipped ${jobResult?.duplicates || 0} duplicates.`;
      case "failed":
        return "❌ Processing failed. Please try again.";
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Transaction Video</CardTitle>
        <CardDescription>
          Upload a video of your credit card transactions. We&apos;ll extract the
          merchant, date, amount, and bitcoin rewards automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            className="hidden"
            id="video-upload"
            disabled={!!jobId && jobStatus !== "completed" && jobStatus !== "failed"}
          />
          <label
            htmlFor="video-upload"
            className={`flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-zinc-300 p-4 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600 ${
              jobId && jobStatus !== "completed" && jobStatus !== "failed" ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {file ? (
              <>
                <FileVideo className="h-5 w-5 text-green-500" />
                <span className="text-sm font-medium">{file.name}</span>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    clearFile();
                  }}
                  className="ml-2 rounded-full p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <Upload className="h-5 w-5" />
                <span className="text-sm font-medium">
                  {jobId ? "Upload another video" : "Select video file"}
                </span>
              </>
            )}
          </label>
          {file && (
            <Button onClick={handleUpload} disabled={uploading}>
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                "Upload & Process"
              )}
            </Button>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        )}

        {jobStatus && (
          <div className={`rounded-lg p-4 text-sm ${
            jobStatus === "completed" 
              ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200" 
              : jobStatus === "failed"
              ? "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
              : "bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200"
          }`}>
            <div className="flex items-start gap-3">
              {jobStatus === "pending" && <Loader2 className="h-5 w-5 animate-spin mt-0.5" />}
              {jobStatus === "processing" && <RefreshCw className="h-5 w-5 animate-spin mt-0.5" />}
              {jobStatus === "completed" && <span className="text-lg">✅</span>}
              {jobStatus === "failed" && <span className="text-lg">❌</span>}
              <div>
                <p className="font-medium">{getStatusMessage()}</p>
                {jobStatus === "processing" && (
                  <p className="text-xs mt-1 opacity-75">
                    You can leave this page and come back later. Your transactions will be saved.
                  </p>
                )}
                {jobStatus === "pending" && (
                  <p className="text-xs mt-1 opacity-75">
                    Usually starts processing within 30 seconds...
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
