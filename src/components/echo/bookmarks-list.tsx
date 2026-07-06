"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { LocalTime } from "@/components/local-time";
import { readBookmarks } from "./echo-actions";

type BookmarkRow = ReturnType<typeof readBookmarks>[number];

const BOOKMARK_KEY = "perpl_echo_bookmarks";

export function BookmarksList() {
  const [bookmarks, setBookmarks] = useState<BookmarkRow[]>([]);

  useEffect(() => {
    setBookmarks(readBookmarks());
  }, []);

  function remove(hash: string) {
    const next = bookmarks.filter((bookmark) => bookmark.analysisHash !== hash);
    localStorage.setItem(BOOKMARK_KEY, JSON.stringify(next));
    setBookmarks(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Saved Echoes</CardTitle>
      </CardHeader>
      <CardContent>
        {bookmarks.length === 0 ? (
          <div className="rounded-sm border border-dashed p-6 text-sm text-muted-foreground">
            Bookmarked market states will appear here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Market</TH>
                  <TH>Time</TH>
                  <TH>Regime</TH>
                  <TH>Cluster</TH>
                  <TH>Hash</TH>
                  <TH className="text-right">Action</TH>
                </TR>
              </THead>
              <TBody>
                {bookmarks.map((bookmark) => (
                  <TR key={bookmark.analysisHash}>
                    <TD className="font-semibold">{bookmark.symbol}</TD>
                    <TD className="whitespace-nowrap"><LocalTime value={bookmark.timestamp} /></TD>
                    <TD>{bookmark.regime?.replaceAll("_", " ") ?? "Unavailable"}</TD>
                    <TD>{bookmark.clusterName ?? "Unavailable"}</TD>
                    <TD className="font-mono text-xs">{bookmark.analysisHash.slice(0, 12)}...</TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button asChild variant="secondary" size="sm">
                          <Link href={`/analysis/${bookmark.analysisHash}`}>
                            <ExternalLink className="h-4 w-4" />
                            Open
                          </Link>
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => remove(bookmark.analysisHash)}>
                          <Trash2 className="h-4 w-4" />
                          Remove
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
