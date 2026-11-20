import { Shield } from "lucide-react";
import Link from "next/link";

export default function CyberNotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] p-8 text-center">
      <div className="p-4 rounded-full bg-cyan-500/10 border border-cyan-500/20 mb-4">
        <Shield className="size-10 text-cyan-600 dark:text-cyan-400" />
      </div>
      <h1 className="text-2xl font-bold text-foreground mb-2">
        Resource Not Found
      </h1>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        The Void Cyber program, session, or finding you requested does not exist
        or you don&apos;t have permission to view it.
      </p>
      <Link
        href="/cyber"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-700 dark:text-cyan-400 text-sm font-medium hover:bg-cyan-500/20 transition-colors"
      >
        Back to Cyber Chat
      </Link>
    </div>
  );
}
