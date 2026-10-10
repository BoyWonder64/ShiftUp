"use client";

import { useState } from "react";

export function EmbedSnippet({ tenantSlug, enabled }: { tenantSlug: string; enabled: boolean }) {
  const [copied, setCopied] = useState(false);
  // window.location.origin rather than an env var - this component only ever
  // renders in the browser at the app's real domain, so there's nothing a
  // build-time env var would add.
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const snippet = `<script src="${origin}/booking-widget.js" data-tenant="${tenantSlug}" async></script>`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (e.g. insecure context) - the
      // snippet is still selectable/copyable by hand from the <code> block.
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-medium">Embed on your website</h2>
      <p className="mt-1 text-sm text-gray-500">
        Paste this snippet into your site&apos;s HTML (anywhere in the page) to show an embedded booking widget.
        {!enabled && " Enable public booking above first - the embed won't show anything until then."}
      </p>

      <div className="mt-3 flex items-start gap-2">
        <code className="flex-1 overflow-x-auto rounded-md bg-gray-900 px-3 py-2 text-xs text-gray-100">{snippet}</code>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="rounded-lg bg-primary-500 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-primary-600"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      <a
        href={`/book/${tenantSlug}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block text-sm text-primary-600 underline-offset-2 hover:underline"
      >
        Preview the booking page →
      </a>
    </section>
  );
}
