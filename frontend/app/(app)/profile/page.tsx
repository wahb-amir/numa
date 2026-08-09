"use client";

import { useEffect, useState } from "react";
import { Mail, Calendar, Shield, Save, LogOut } from "lucide-react";
import { TopHeader } from "@/components/shell/top-header";
import { LogoutButton } from "@/components/shell/logout-button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getProfile, updateProfile } from "@/lib/api-client";
import { useUnits, type Units } from "@/lib/units-context";
import type { ApiProfile } from "@/lib/types";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ProfilePage() {
  const { units: globalUnits, setUnits: setGlobalUnits } = useUnits();
  const [profile, setProfile] = useState<ApiProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [units, setUnitsLocal] = useState<Units>(globalUnits);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const setUnits = (next: Units) => {
    setUnitsLocal(next);
    // Apply live so distance / pace components re-render before the
    // server confirms the write.
    setGlobalUnits(next);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getProfile();
        if (!cancelled) {
          setProfile(data);
          setDisplayName(data.display_name ?? "");
          setUnits(data.units ?? "metric");
        }
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error
              ? err.message
              : "Could not load profile from the server.",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty =
    profile !== null &&
    (displayName.trim() !== (profile.display_name ?? "") ||
      units !== (profile.units ?? "metric"));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSavedAt(null);
    setSaving(true);
    try {
      const updated = await updateProfile({
        display_name: displayName.trim(),
        units,
      });
      setProfile((prev) => (prev ? { ...prev, ...updated } : prev));
      setSavedAt(updated.updated_at ?? new Date().toISOString());
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to save changes.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <TopHeader
        title="Profile"
        subtitle="Account info, preferences, and session"
      />

      {loading && (
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 lg:px-8 lg:py-8 animate-pulse">
          <div className="h-40 rounded-card bg-surface-sunken" />
          <div className="h-64 rounded-card bg-surface-sunken" />
        </div>
      )}

      {!loading && error && (
        <div className="mx-auto max-w-3xl px-4 py-6 lg:px-8 lg:py-8">
          <div className="rounded-card border border-status-concerning-soft bg-status-concerning-soft px-5 py-4 text-sm text-status-concerning">
            {error}
          </div>
        </div>
      )}

      {!loading && !error && profile && (
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 lg:px-8 lg:py-8">
          {/* Account info */}
          <Card>
            <CardHeader>
              <div className="space-y-1">
                <CardTitle>Account</CardTitle>
                <p className="text-xs text-text-muted">
                  Email and authentication are managed by Supabase.
                </p>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <dl className="divide-y divide-border text-sm">
                <div className="flex items-start gap-3 py-3">
                  <Mail
                    className="mt-0.5 h-4 w-4 text-text-muted"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">
                      Email
                    </dt>
                    <dd className="mt-0.5 truncate text-text-primary">
                      {profile.email}
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-3 py-3">
                  <Calendar
                    className="mt-0.5 h-4 w-4 text-text-muted"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">
                      Last sign-in
                    </dt>
                    <dd className="mt-0.5 text-text-primary tabular">
                      {formatDateTime(profile.last_sign_in_at)}
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-3 py-3">
                  <Shield
                    className="mt-0.5 h-4 w-4 text-text-muted"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">
                      Account created
                    </dt>
                    <dd className="mt-0.5 text-text-primary tabular">
                      {formatDateTime(profile.created_at)}
                    </dd>
                  </div>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Preferences */}
          <Card>
            <CardHeader>
              <div className="space-y-1">
                <CardTitle>Preferences</CardTitle>
                <p className="text-xs text-text-muted">
                  How Numa addresses you and what units to display.
                </p>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <form onSubmit={handleSave} className="space-y-5">
                <div>
                  <label
                    htmlFor="display-name"
                    className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-text-muted"
                  >
                    Display name
                  </label>
                  <input
                    id="display-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={80}
                    placeholder="What should Numa call you?"
                    className="w-full rounded-control border border-border bg-surface-base px-3.5 py-2.5 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent-emerald focus:ring-1 focus:ring-accent-emerald/30"
                  />
                </div>

                <fieldset>
                  <legend className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-text-muted">
                    Units
                  </legend>
                  <div className="grid grid-cols-2 gap-2">
                    {(["metric", "imperial"] as const).map((u) => (
                      <label
                        key={u}
                        className={`flex cursor-pointer items-center justify-between rounded-control border px-3 py-2.5 text-sm transition-colors ${
                          units === u
                            ? "border-accent-emerald bg-accent-emerald-soft/50 text-text-primary"
                            : "border-border bg-surface-base text-text-secondary hover:bg-surface-sunken"
                        }`}
                      >
                        <span className="font-medium capitalize">{u}</span>
                        <input
                          type="radio"
                          name="units"
                          value={u}
                          checked={units === u}
                          onChange={() => setUnits(u)}
                          className="h-4 w-4 accent-accent-emerald"
                        />
                      </label>
                    ))}
                  </div>
                </fieldset>

                {formError && (
                  <div className="rounded-chip border-l-2 border-status-concerning bg-status-concerning-soft px-3 py-2.5 text-sm text-status-concerning">
                    {formError}
                  </div>
                )}
                {savedAt && !formError && (
                  <div className="rounded-chip border-l-2 border-status-positive bg-status-positive-soft px-3 py-2.5 text-sm text-status-positive">
                    Saved at {formatDateTime(savedAt)}.
                  </div>
                )}

                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={!dirty || saving}
                    className="min-w-[140px]"
                  >
                    <Save className="h-4 w-4" aria-hidden="true" />
                    {saving ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Session */}
          <Card>
            <CardHeader>
              <div className="space-y-1">
                <CardTitle>Session</CardTitle>
                <p className="text-xs text-text-muted">
                  Signing out revokes your JWT and refresh token server-side.
                </p>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3 text-sm">
                  <LogOut
                    className="mt-0.5 h-4 w-4 text-status-concerning"
                    aria-hidden="true"
                  />
                  <p className="text-text-secondary">
                    You will be returned to the sign-in page. Any other devices
                    currently signed in to this account will also be signed
                    out.
                  </p>
                </div>
                <LogoutButton
                  label="Sign out"
                  className="rounded-control bg-status-concerning-soft px-4 py-2 text-sm font-semibold text-status-concerning hover:bg-status-concerning/15"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}