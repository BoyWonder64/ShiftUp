import { RevenueOverview } from "../RevenueOverview";

export default function OverviewPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Income</h1>
        <p className="mt-1 text-gray-500">Recurring and one-time revenue across every tenant.</p>
      </div>
      <RevenueOverview />
    </>
  );
}
