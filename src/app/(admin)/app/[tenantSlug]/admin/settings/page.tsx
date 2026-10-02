import Link from "next/link";
import { SETTINGS_SECTIONS } from "./sections";

export default async function SettingsIndexPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const base = `/app/${tenantSlug}/admin/settings`;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {SETTINGS_SECTIONS.map((section) => (
        <Link
          key={section.slug}
          href={`${base}/${section.slug}`}
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-primary-300 hover:bg-primary-50/40"
        >
          <h2 className="font-semibold text-gray-900">{section.label}</h2>
          <p className="mt-1 text-sm text-gray-500">{section.description}</p>
        </Link>
      ))}
    </div>
  );
}
