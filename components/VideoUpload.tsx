"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Loader2, X, FileVideo } from "lucide-react";
import { VideoProcessResult } from "@/lib/types";

interface VideoUploadProps {
  onUploadComplete: () => void;
}

export function VideoUpload({ onUploadComplete }: VideoUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<VideoProcessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const base64 = await fileToBase64(file);
      
      const response = await fetch("/api/transactions/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video: base64 }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to process video");
      }

      const data = await response.json();
      setResult(data);
      onUploadComplete();
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
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
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
          />
          <label
            htmlFor="video-upload"
            className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-zinc-300 p-4 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600"
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
                  Select video file
                </span>
              </>
            )}
          </label>
          {file && (
            <Button onClick={handleUpload} disabled={uploading}>
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Process Video"
              )}
            </Button>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        )}

        {result && (
          <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">
            <p className="font-medium">Video processed successfully!</p>
            <p>
              Found {result.transactions.length} transactions. Added{" "}
              {result.added} new transactions, skipped {result.duplicates} duplicates.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
