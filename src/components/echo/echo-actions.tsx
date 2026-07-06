"use client";

import { useEffect, useMemo, useState } from "react";
import { Bookmark, ThumbsDown, ThumbsUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { num, pct } from "@/lib/utils";

type BookmarkPayload = {
  id: string;
  symbol: string;
  timestamp: string;
  clusterName: string | null;
  regime: string | null;
  echoScore: number | null;
  rarityScore: number | null;
  currentPrice: number;
  fundingRate: number;
  fundingApr: number;
  analysisHash: string;
  createdAt: string;
  signature?: string;
  walletAddress?: string;
};

type EchoActionsProps = Omit<BookmarkPayload, "id" | "createdAt">;

const BOOKMARK_KEY = "perpl_echo_bookmarks";
const VOTE_KEY = "perpl_echo_votes";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

export function EchoActions(props: EchoActionsProps) {
  const [bookmarked, setBookmarked] = useState(false);
  const [localVote, setLocalVote] = useState<1 | -1 | null>(null);
  const [counts, setCounts] = useState({ upvotes: 0, downvotes: 0, score: 0 });
  const [status, setStatus] = useState<string | null>(null);
  const walletEnabled = process.env.NEXT_PUBLIC_ENABLE_WALLET_FEATURES === "true";

  const bookmark = useMemo<BookmarkPayload>(
    () => ({
      ...props,
      id: props.analysisHash,
      createdAt: new Date().toISOString()
    }),
    [props]
  );

  useEffect(() => {
    setBookmarked(readBookmarks().some((item) => item.analysisHash === props.analysisHash));
    const votes = readVotes();
    setLocalVote(votes[props.analysisHash] ?? null);
    fetch(`/api/echo-vote/${props.analysisHash}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data) setCounts({ upvotes: data.upvotes ?? 0, downvotes: data.downvotes ?? 0, score: data.score ?? 0 });
      })
      .catch(() => undefined);
  }, [props.analysisHash]);

  function saveBookmark(next: BookmarkPayload) {
    const bookmarks = readBookmarks().filter((item) => item.analysisHash !== next.analysisHash);
    localStorage.setItem(BOOKMARK_KEY, JSON.stringify([next, ...bookmarks].slice(0, 100)));
    setBookmarked(true);
    setStatus("Echo bookmarked locally.");
  }

  async function signBookmark() {
    const provider = ethereum();
    if (!provider) {
      setStatus("Wallet provider not found.");
      return;
    }
    const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
    const walletAddress = accounts[0];
    const message = bookmarkMessage(bookmark);
    const signature = (await provider.request({ method: "personal_sign", params: [message, walletAddress] })) as string;
    saveBookmark({ ...bookmark, walletAddress, signature });
    setStatus("Bookmark signed and saved locally. No gas was used.");
  }

  async function vote(voteValue: 1 | -1, sign = false) {
    let walletAddress: string | null = null;
    let signature: string | null = null;
    const message = `I ${voteValue === 1 ? "upvote" : "downvote"} this Perpl Echo market state: ${props.analysisHash}`;
    if (sign) {
      const provider = ethereum();
      if (!provider) {
        setStatus("Wallet provider not found.");
        return;
      }
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      walletAddress = accounts[0];
      signature = (await provider.request({ method: "personal_sign", params: [message, walletAddress] })) as string;
    }

    const votes = readVotes();
    votes[props.analysisHash] = voteValue;
    localStorage.setItem(VOTE_KEY, JSON.stringify(votes));
    setLocalVote(voteValue);

    if (sign) {
      const response = await fetch("/api/echo-vote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ analysisHash: props.analysisHash, symbol: props.symbol, voteValue, walletAddress, signature, message })
      });
      if (response.ok) {
        const data = await response.json();
        setCounts(data.counts ?? counts);
        setStatus("Signed vote saved. No transaction was sent.");
      }
    } else {
      setStatus("Vote saved locally.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => saveBookmark(bookmark)} variant={bookmarked ? "secondary" : "default"}>
          <Bookmark className="h-4 w-4" />
          {bookmarked ? "Bookmarked" : "Bookmark Echo"}
        </Button>
        {walletEnabled ? (
          <Button type="button" variant="secondary" onClick={signBookmark}>
            <Wallet className="h-4 w-4" />
            Sign Bookmark
          </Button>
        ) : null}
        <Button type="button" variant={localVote === 1 ? "default" : "secondary"} onClick={() => vote(1)}>
          <ThumbsUp className="h-4 w-4" />
          Upvote
        </Button>
        <Button type="button" variant={localVote === -1 ? "default" : "secondary"} onClick={() => vote(-1)}>
          <ThumbsDown className="h-4 w-4" />
          Downvote
        </Button>
        {walletEnabled ? (
          <Button type="button" variant="ghost" onClick={() => vote(localVote ?? 1, true)}>
            <Wallet className="h-4 w-4" />
            Sign Vote
          </Button>
        ) : null}
      </div>
      <div className="text-xs text-muted-foreground">
        Vote score: {counts.score} ({counts.upvotes} up / {counts.downvotes} down). Signing does not cost gas and does not move funds.
      </div>
      <div className="text-xs text-muted-foreground">
        Bookmark summary: {props.symbol} at ${num(props.currentPrice, 2)}, funding {pct(props.fundingRate * 100, 4)}, APR {pct(props.fundingApr, 2)}.
      </div>
      {status ? <div className="text-xs text-primary">{status}</div> : null}
    </div>
  );
}

export function readBookmarks(): BookmarkPayload[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(BOOKMARK_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readVotes(): Record<string, 1 | -1> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(VOTE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function bookmarkMessage(bookmark: BookmarkPayload) {
  return [
    "I bookmark this Perpl Echo market state.",
    `Symbol: ${bookmark.symbol}`,
    `Analysis Hash: ${bookmark.analysisHash}`,
    `Timestamp: ${bookmark.timestamp}`
  ].join("\n");
}

function ethereum() {
  return typeof window !== "undefined" ? ((window as Window & { ethereum?: EthereumProvider }).ethereum ?? null) : null;
}
