import Link from "next/link";

const FEATURES = [
  {
    title: "Shift management",
    description: "Staff rosters, shifts, and time-off — built for trades and field crews.",
  },
  {
    title: "Appointment manager",
    description: "Client bookings, notes, and payment collection for appointment-based work.",
  },
  {
    title: "Free to start",
    description: "Explore the full product on a capped free plan before you pay a cent.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-linear-to-b from-primary-50 via-white to-white" />
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-8 pt-24 pb-20 text-center">
          <span className="rounded-full bg-primary-50 px-4 py-1 text-xs font-semibold tracking-wide text-primary-700 uppercase">
            Scheduling, built simple
          </span>
          <h1 className="text-5xl font-semibold tracking-tight text-gray-900">
            Shift<span className="text-primary-500">Up</span>
          </h1>
          <p className="max-w-xl text-lg text-gray-600">
            Scheduling, notes, and payment collection for appointment-based
            service businesses and shift-based crews — one tool, no per-seat
            subscription required.
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/signup"
              className="rounded-lg bg-linear-to-r from-primary-500 to-primary-550 px-6 py-3 font-medium text-white shadow-md transition-all hover:shadow-lg"
            >
              Create your business account
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-gray-200 bg-white px-6 py-3 font-medium text-gray-700 shadow-sm transition-all hover:border-primary-200 hover:text-primary-700 hover:shadow-md"
            >
              Log in
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 px-8 pb-24 sm:grid-cols-3">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md"
          >
            <div className="mb-3 h-1.5 w-10 rounded-full bg-linear-to-r from-primary-500 to-primary-550" />
            <h2 className="text-lg font-semibold text-gray-900">{feature.title}</h2>
            <p className="mt-2 text-sm text-gray-600">{feature.description}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
