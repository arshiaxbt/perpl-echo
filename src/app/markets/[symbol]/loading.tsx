import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function MarketLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        Loading market analysis
      </div>

      <section className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Current State</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-sm border border-border bg-muted/35" />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Historical Echo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="h-40 animate-pulse rounded-sm border border-border bg-muted/35" />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="h-20 animate-pulse rounded-sm border border-border bg-muted/35" />
              <div className="h-20 animate-pulse rounded-sm border border-border bg-muted/35" />
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Historical Echo Matches</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-10 animate-pulse rounded-sm border border-border bg-muted/35" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
