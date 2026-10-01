"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const MAX_FILE_BYTES = 500 * 1024;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read file."));
    reader.readAsDataURL(file);
  });
}

export function LogoSettings({ initialLogoUrl }: { initialLogoUrl: string | null }) {
  const router = useRouter();
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    setError(null);
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Use a PNG, JPEG, WebP, or SVG image.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("Keep the logo under 500KB.");
      return;
    }

    setUploading(true);
    try {
      const dataUrl = await readAsDataUrl(file);
      const res = await fetch("/api/admin/logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed.");
      setLogoUrl(data.tenant.logoDataUrl);
      // AppHeader renders the logo server-side (from the tenant row each
      // page fetches) - refresh so it picks up the new value immediately,
      // not just this client component's own local preview.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setError(null);
    setRemoving(true);
    try {
      const res = await fetch("/api/admin/logo", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't remove logo.");
      setLogoUrl(data.tenant.logoDataUrl);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove logo.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-medium">Company logo</h2>
      <p className="mt-1 text-sm text-gray-500">
        Shown next to your business name in the top navigation, for everyone on
        your team. PNG, JPEG, WebP, or SVG, up to 500KB.
      </p>

      <div className="mt-4 flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary admin-uploaded data: URL, not a static/optimizable asset
            <img src={logoUrl} alt="Company logo" className="h-full w-full rounded-lg object-contain" />
          ) : (
            <span className="text-xs text-gray-400">No logo</span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-primary-300 hover:text-primary-700 disabled:opacity-50"
            >
              {uploading ? "Uploading..." : logoUrl ? "Replace logo" : "Upload logo"}
            </button>
            {logoUrl && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={removing || uploading}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 shadow-sm transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                {removing ? "Removing..." : "Remove"}
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            onChange={handleFileChange}
            className="hidden"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </section>
  );
}
