"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, XCircle, Clock } from "lucide-react";

interface Job {
  id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  error: string | null;
}

interface JobStatusProps {
  onAllComplete?: () => void;
}

export function JobStatus({ onAllComplete }: JobStatusProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchJobs = async () => {
    try {
      const response = await fetch("/api/jobs/status");
      if (response.ok) {
        const data = await response.json();
        setJobs(data.jobs || []);
        
        // Trigger worker if there are pending jobs
        if (data.jobs?.some((j: Job) => j.status === "pending" || j.status === "processing")) {
          fetch("/api/worker", { method: "POST" }).catch(() => {});
        }
        
        // Check if all jobs are complete
        if (data.jobs?.length > 0 && data.jobs.every((j: Job) => j.status === "completed" || j.status === "failed")) {
          onAllComplete?.();
        }
      }
    } catch (err) {
      console.error("Failed to fetch job status:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    
    // Poll for updates if there are active jobs
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, []);

  const pendingCount = jobs.filter(j => j.status === "pending").length;
  const processingCount = jobs.filter(j => j.status === "processing").length;
  const completedCount = jobs.filter(j => j.status === "completed").length;
  const failedCount = jobs.filter(j => j.status === "failed").length;

  // Don't show if no recent jobs
  if (!loading && jobs.length === 0) {
    return null;
  }

  // Don't show if all jobs are done (completed or failed) and older than 5 minutes
  const hasRecentActiveJobs = jobs.some(j => {
    if (j.status === "pending" || j.status === "processing") return true;
    const completedAt = j.completed_at ? new Date(j.completed_at) : new Date();
    const ageMinutes = (Date.now() - completedAt.getTime()) / 1000 / 60;
    return ageMinutes < 5;
  });

  if (!loading && !hasRecentActiveJobs) {
    return null;
  }

  return (
    <Card className="mb-6 border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          {(pendingCount > 0 || processingCount > 0) && (
            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
          )}
          Background Processing
        </CardTitle>
        <CardDescription>
          Your video batches are being processed in the background
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4">
          {pendingCount > 0 && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              <span className="text-sm">{pendingCount} pending</span>
            </div>
          )}
          {processingCount > 0 && (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              <span className="text-sm">{processingCount} processing</span>
            </div>
          )}
          {completedCount > 0 && (
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm">{completedCount} completed</span>
            </div>
          )}
          {failedCount > 0 && (
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="text-sm">{failedCount} failed</span>
            </div>
          )}
        </div>
        {(pendingCount > 0 || processingCount > 0) && (
          <p className="text-xs text-zinc-500 mt-3">
            Processing one batch at a time to avoid rate limits. This page will auto-refresh.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
