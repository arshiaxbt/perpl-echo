"use client";

import { useEffect, useState } from "react";

export function LocalTime({
  value,
  withSeconds = false
}: {
  value: string | Date | null | undefined;
  withSeconds?: boolean;
}) {
  const [formatted, setFormatted] = useState<string>(() => fallback(value));

  useEffect(() => {
    if (!value) {
      setFormatted("Pending");
      return;
    }

    const date = typeof value === "string" ? new Date(value) : value;
    setFormatted(
      new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: withSeconds ? "2-digit" : undefined,
        timeZoneName: "short"
      }).format(date)
    );
  }, [value, withSeconds]);

  return <time dateTime={value ? new Date(value).toISOString() : undefined}>{formatted}</time>;
}

function fallback(value: string | Date | null | undefined) {
  if (!value) return "Pending";
  return new Date(value).toISOString().replace("T", " ").slice(0, 16);
}
