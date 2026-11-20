export function SidebarLoadError({
  label,
  onRetry,
}: {
  label: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-2 text-xs text-muted-foreground">
      <span>{label}</span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md px-2 py-1 font-medium text-foreground transition-colors hover:bg-sidebar-accent active:scale-[0.97]"
      >
        Retry
      </button>
    </div>
  );
}
