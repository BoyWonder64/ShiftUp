import { SiteHeader } from "@/components/SiteHeader";
import { ResetPasswordForm } from "./ResetPasswordForm";

// Server component reading the ?token= query param (same async searchParams
// convention as every other page in this app) and handing it to the client
// form below - avoids needing a useSearchParams()-in-a-Suspense-boundary
// dance for what's otherwise a fully client-rendered page.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center bg-linear-to-b from-primary-50 via-white to-white p-8">
        <div className="flex w-full max-w-sm flex-col items-center gap-6">
          <ResetPasswordForm token={token ?? null} />
        </div>
      </main>
    </>
  );
}
