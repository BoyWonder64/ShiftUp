export function LoadingSpinner({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8">
      <div
        role="status"
        aria-label={label ?? "Loading"}
        className="h-10 w-10 animate-spin rounded-full border-4 border-primary-100 border-t-primary-500"
      />
      {label ? <p className="text-sm text-foreground/60">{label}</p> : null}
    </div>
  );
}
