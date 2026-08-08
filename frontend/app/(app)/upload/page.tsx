import type { Metadata } from "next";
import { TopHeader } from "@/components/shell/top-header";
import { UploadDropzone } from "@/components/dashboard/upload-dropzone";

export const metadata: Metadata = { title: "Upload Data — Numa" };

export default function UploadPage() {
  return (
    <div>
      <TopHeader
        title="Upload Data"
        subtitle="Add workout files to build your personal health context"
      />
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 lg:px-8 lg:py-8">
        <UploadDropzone />

        {/* Format guide */}
        <div className="rounded-card border border-border bg-surface-raised p-6">
          <h2 className="text-sm font-semibold text-text-primary">Accepted formats</h2>
          <dl className="mt-4 space-y-4">
            <div className="flex gap-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-surface-sunken">
                <span className="text-xs font-bold text-text-secondary">CSV</span>
              </div>
              <div>
                <dt className="text-sm font-medium text-text-primary">Comma-separated values</dt>
                <dd className="mt-0.5 text-xs text-text-muted">
                  Export from Garmin Connect, Apple Health (via shortcuts), or any spreadsheet
                  with columns: date, activity_type, duration_seconds, and optional metrics.
                </dd>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-surface-sunken">
                <span className="text-xs font-bold text-text-secondary">GPX</span>
              </div>
              <div>
                <dt className="text-sm font-medium text-text-primary">GPS Exchange Format</dt>
                <dd className="mt-0.5 text-xs text-text-muted">
                  Standard GPS track files exported from Strava, Wahoo, Garmin, or most cycling
                  and running apps.
                </dd>
              </div>
            </div>
          </dl>
        </div>

        {/* Privacy note */}
        <p className="text-center text-xs text-text-muted">
          Files are uploaded directly and securely to your private storage bucket.
          Numa never shares your data with third parties.
        </p>
      </div>
    </div>
  );
}
