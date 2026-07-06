import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="space-y-4 rounded-sm border bg-card p-6">
      <h1 className="text-2xl font-semibold">Market analysis unavailable</h1>
      <p className="text-sm text-muted-foreground">
        This market has no collected snapshots yet, or it does not have enough historical rows for outcomes.
      </p>
      <Button asChild>
        <Link href="/">Back to markets</Link>
      </Button>
    </div>
  );
}
