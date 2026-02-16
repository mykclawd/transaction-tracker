"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Loader2, X, FileVideo, Check, Brain, Clock, LogOut } from "lucide-react";

interface VideoUploadProps {
  onUploadComplete: () => void;
}

type ProcessingStep = "idle" | "uploading" | "processing" | "completed" | "failed";

interface StepInfo {
  step: ProcessingStep;
  progress: number;
  message: string;
  canLeave?: boolean;  // Indicates if user can safely leave the page
}

interface BackgroundJob {
  id: string;
  status: string;
  created_at: string;
}

export function VideoUpload({ onUploadComplete }: VideoUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [stepInfo, setStepInfo] = useState<StepInfo>({ step: "idle", progress: 0, message: "", canLeave: true });
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobResult, setJobResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [backgroundJobs, setBackgroundJobs] = useState<BackgroundJob[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const backgroundPollRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (backgroundPollRef.current) {
        clearInterval(backgroundPollRef.current);
      }
    };
  }, []);

  // Fetch background jobs on mount and poll for updates
  const fetchBackgroundJobs = async () => {
    try {
      const response = await fetch("/api/jobs/status");
      if (response.ok) {
        const data = await response.json();
        const activeJobs = (data.jobs || []).filter((j: BackgroundJob) => 
          j.status === "pending" || j.status === "processing"
        );
        setBackgroundJobs(activeJobs);
        
        // Trigger worker if there are pending jobs - use multiple triggers to ensure processing starts
        if (activeJobs.filter((j: BackgroundJob) => j.status === 'pending').length > 0) {
          // Trigger 2 workers to process pending jobs (Vercel Pro allows 2 concurrent)
          fetch("/api/worker", { method: "POST" }).catch(() => {});
          setTimeout(() => fetch("/api/worker", { method: "POST" }).catch(() => {}), 500);
        }
        
        // Refresh transactions when jobs complete
        if (activeJobs.length === 0 && backgroundJobs.length > 0) {
          onUploadComplete();
        }
      }
    } catch (err) {
      console.error("Failed to fetch background jobs:", err);
    }
  };

  useEffect(() => {
    fetchBackgroundJobs();
    backgroundPollRef.current = setInterval(fetchBackgroundJobs, 1500); // Poll faster for Pro
    return () => {
      if (backgroundPollRef.current) {
        clearInterval(backgroundPollRef.current);
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

  // Submit video as single upload
  const submitVideo = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('video', file);
    
    const response = await fetch("/api/upload-video", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Upload failed: ${response.status}`);
    }

    const { jobId } = await response.json();
    return jobId;
  };

  // Trigger worker and check job status
  const checkJobStatus = async (jobId: string): Promise<{ status: string; result?: any; error?: string }> => {
    // Trigger worker to process jobs
    await fetch("/api/worker", { method: "POST" }).catch(() => {});
    
    // Check job status
    const response = await fetch(`/api/jobs/${jobId}`);
    if (!response.ok) throw new Error("Failed to check job status");
    return response.json();
  };

  // Wait for a job to complete
  const waitForJob = async (jobId: string): Promise<any> => {
    while (true) {
      const data = await checkJobStatus(jobId);
      
      if (data.status === "completed") {
        return data.result;
      } else if (data.status === "failed") {
        throw new Error(data.error || "Job failed");
      }
      
      // Wait 2 seconds before polling again
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setError(null);
    resetState();

    try {
      // Upload the raw video file directly
      setStepInfo({ step: "uploading", progress: 10, message: "Uploading video...", canLeave: false });
      
      const newJobId = await submitVideo(file);
      setJobId(newJobId);
      
      setStepInfo({ 
        step: "processing", 
        progress: 50, 
        message: `✅ Video uploaded! Extracting frames on server...`,
        canLeave: true
      });
      
      // Refresh background jobs list
      fetchBackgroundJobs();
      
      // Clear file input
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      
      // Wait for the single job to complete
      const result = await waitForJob(newJobId);
      const totalTransactions = result?.added || result?.transactionsCreated || 0;
      
      setJobResult({ transactionsCreated: totalTransactions });
      setStepInfo({ 
        step: "completed", 
        progress: 100, 
        message: `Found ${totalTransactions} transaction${totalTransactions !== 1 ? 's' : ''} from ${totalBatches} batch${totalBatches > 1 ? 'es' : ''}!`,
        canLeave: true
      });
      onUploadComplete();
      
    } catch (err) {
      console.error("Upload error:", err);
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
              
              {/* Can Leave Indicator */}
              {stepInfo.step !== "completed" && stepInfo.step !== "failed" && (
                <div className={`flex items-center gap-2 text-sm mt-2 ${
                  stepInfo.canLeave 
                    ? "text-green-600 dark:text-green-400" 
                    : "text-amber-600 dark:text-amber-400"
                }`}>
                  {stepInfo.canLeave ? (
                    <>
                      <LogOut className="h-4 w-4" />
                      <span>You can safely close this page — processing continues in background</span>
                    </>
                  ) : (
                    <>
                      <Clock className="h-4 w-4" />
                      <span>Please keep this page open while uploading...</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Background Jobs Status */}
        {backgroundJobs.length > 0 && stepInfo.step === "idle" && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
            <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="font-medium">Background Processing</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-blue-700 dark:text-blue-300">
              {backgroundJobs.filter(j => j.status === "pending").length > 0 && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {backgroundJobs.filter(j => j.status === "pending").length} pending
                </span>
              )}
              {backgroundJobs.filter(j => j.status === "processing").length > 0 && (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {backgroundJobs.filter(j => j.status === "processing").length} processing
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">
              Your transactions will appear automatically when processing completes
            </p>
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
