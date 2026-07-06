import { BookmarksList } from "@/components/echo/bookmarks-list";

export const dynamic = "force-dynamic";

export default function BookmarksPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold md:text-5xl">Echo Bookmarks</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Saved market states live in this browser. Optional wallet signatures prove intent without gas, transfers, approvals, or trading.
        </p>
      </div>
      <BookmarksList />
      <p className="text-xs text-muted-foreground">
        Not financial advice. Historical similarity does not guarantee future outcomes.
      </p>
    </div>
  );
}
