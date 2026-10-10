import { Suspense } from "react";
import { BookingPage } from "./BookingPage";

export default async function PublicBookingPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  return (
    <Suspense fallback={null}>
      <BookingPage tenantSlug={tenantSlug} />
    </Suspense>
  );
}
