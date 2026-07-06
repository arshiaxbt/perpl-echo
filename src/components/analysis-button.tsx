"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AnalysisButton({ symbol }: { symbol: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function analyze() {
    setLoading(true);
    try {
      await fetch(`/api/analyze/${symbol}`, { cache: "no-store" });
      router.push(`/markets/${symbol}`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={analyze} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
      Analyze
    </Button>
  );
}
