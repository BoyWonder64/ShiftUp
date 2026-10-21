"use client";

import { useEffect, useState } from "react";

/**
 * The copy-paste embed snippet for a tenant's public booking page - a single
 * <script> tag (see public/booking-widget.js) that injects a self-resizing
 * iframe pointing at /book/[tenantSlug]. The snippet itself works regardless
 * of `enabled`, but there's nothing to book until public booking is turned
 * on, so it's hidden behind that flag to avoid a customer embedding a widget
 * that just 404s.
 */
export function EmbedSnippet({ tenantSlug, enabled }: { tenantSlug: string; enabled: boolean }) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Deferred into a callback rather than calling setState directly in the
    // effect body, to satisfy react-hooks/set-state-in-effect - same pattern
    // as TimeGutterHeader in SchedulingCalendar.tsx.
    const timer = setTimeout(() => setOrigin(window.location.origin), 0);
    return () => clearTimeout(timer);
  }, []);

  const hostedUrl = origin ? `${origin}/book/${tenantSlug}` : "";
  const snippet = origin ? `<script src="${origin}/booking-widget.js" data-tenant="${tenantSlug}" defer></script>` : "";

  async function copy() {
    if (!snippet) return;
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-medium">Embed on your website</h2>
      <p className="mt-1 text-sm text-gray-500">
        Paste this snippet anywhere in your site&apos;s HTML to embed a self-sizing booking widget, or just
        link to the hosted page directly.
      </p>

      {!enabled ? (
        <p className="mt-4 text-sm text-amber-600">
          Turn on &quot;Enable public booking&quot; above first - the snippet won&apos;t show anything until
          then.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <div>
            <p className="text-xs font-medium text-gray-500">Hosted page</p>
            <a
              href={hostedUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary-600 underline-offset-2 hover:underline"
            >
              {hostedUrl}
            </a>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500">Embed snippet</p>
            <div className="mt-1 flex items-start gap-2">
              <code className="flex-1 overflow-x-auto rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                {snippet}
              </code>
              <button
                type="button"
                onClick={() => void copy()}
                className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
