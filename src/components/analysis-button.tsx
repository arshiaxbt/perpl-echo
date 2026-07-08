"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AnalysisButton({ symbol }: { symbol: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function analyze() {
    startTransition(() => {
      router.push(`/markets/${symbol}`);
    });
  }

  return (
    <Button onClick={analyze} disabled={pending} aria-busy={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
      {pending ? "Opening" : "Analyze"}
    </Button>
  );
}
