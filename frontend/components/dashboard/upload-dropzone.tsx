"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export function UploadDropzone() {
  const [status, setStatus] = useState<"idle" | "uploading" | "processing" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const pollStatus = async (uploadId: string) => {
    setStatus("processing");
    const interval = setInterval(async () => {
      try {
        const { data } = await api.get(`/uploads/${uploadId}/status`);
        if (data.upload_status === "complete") {
          setStatus("success");
          clearInterval(interval);
        } else if (data.upload_status === "failed") {
          setStatus("error");
          setErrorMessage(data.error_message || "Processing failed");
          clearInterval(interval);
        }
      } catch (err) {
        setStatus("error");
        setErrorMessage("Failed to check status");
        clearInterval(interval);
      }
    }, 2000);
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setStatus("uploading");
    setErrorMessage("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const { data } = await api.post("/uploads", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      if (data.uploadId) {
        pollStatus(data.uploadId);
      }
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(err.response?.data?.error || "Upload failed");
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/gpx+xml": [".gpx"],
    },
    maxFiles: 1,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Activity Data</CardTitle>
      </CardHeader>
      <CardContent>
        {status === "idle" && (
          <div
            {...getRootProps()}
            className={`cursor-pointer rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
              isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400"
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="mx-auto mb-4 h-10 w-10 text-gray-400" />
            <p className="text-sm font-medium text-gray-700">
              {isDragActive ? "Drop the file here" : "Drag & drop a CSV or GPX file here"}
            </p>
            <p className="mt-1 text-xs text-gray-500">or click to select a file</p>
          </div>
        )}

        {status === "uploading" && (
          <div className="flex flex-col items-center justify-center p-10 text-center">
            <Loader2 className="mb-4 h-10 w-10 animate-spin text-blue-500" />
            <p className="text-sm font-medium text-gray-700">Uploading file...</p>
          </div>
        )}

        {status === "processing" && (
          <div className="flex flex-col items-center justify-center p-10 text-center">
            <Loader2 className="mb-4 h-10 w-10 animate-spin text-yellow-500" />
            <p className="text-sm font-medium text-gray-700">Processing activity data...</p>
            <p className="mt-1 text-xs text-gray-500">This might take a moment.</p>
          </div>
        )}

        {status === "success" && (
          <div className="flex flex-col items-center justify-center p-10 text-center">
            <CheckCircle className="mb-4 h-10 w-10 text-green-500" />
            <p className="text-sm font-medium text-gray-700">Upload processed successfully!</p>
            <button
              onClick={() => setStatus("idle")}
              className="mt-4 text-sm text-blue-600 hover:underline"
            >
              Upload another file
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center justify-center p-10 text-center">
            <AlertCircle className="mb-4 h-10 w-10 text-red-500" />
            <p className="text-sm font-medium text-red-600">Error: {errorMessage}</p>
            <button
              onClick={() => setStatus("idle")}
              className="mt-4 text-sm text-blue-600 hover:underline"
            >
              Try again
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
