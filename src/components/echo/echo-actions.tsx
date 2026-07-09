"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Bookmark, TrendingDown, TrendingUp, UserRound, Wallet } from "lucide-react";
import { getAccessToken, usePrivy, type User } from "@privy-io/react-auth";
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
const CONSENSUS_KEY = "perpl_echo_consensus_votes";
const BROWSER_ID_KEY = "perpl_echo_browser_id";
const HORIZON_HOURS = 4;

type ConsensusVote = "BULLISH" | "BEARISH";
type ConsensusState = {
  open: boolean;
  timeRemainingSeconds: number;
  bullishVotes: number;
  bearishVotes: number;
  totalVotes: number;
  bullishPercent: number;
  bearishPercent: number;
  actualReturnPercent: number | null;
  actualOutcome: "BULLISH" | "BEARISH" | "FLAT" | null;
  communityResult: "CORRECT" | "WRONG" | "MIXED" | null;
};

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

export function EchoActions(props: EchoActionsProps) {
  const { ready, authenticated, user, login } = usePrivy();
  const [bookmarked, setBookmarked] = useState(false);
  const [localVote, setLocalVote] = useState<ConsensusVote | null>(null);
  const [consensus, setConsensus] = useState<ConsensusState | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const walletEnabled = process.env.NEXT_PUBLIC_ENABLE_WALLET_FEATURES === "true";
  const consensusKey = `${props.analysisHash}:${HORIZON_HOURS}`;

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
    const votes = readConsensusVotes();
    setLocalVote(votes[consensusKey] ?? null);
    const search = new URLSearchParams({
      symbol: props.symbol,
      snapshotTimestamp: props.timestamp
    });
    fetch(`/api/echo-vote/${props.analysisHash}?${search.toString()}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data) setConsensus(data);
      })
      .catch(() => undefined);
  }, [consensusKey, props.analysisHash, props.symbol, props.timestamp]);

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

  async function submitConsensus(voteValue: ConsensusVote, sign = false) {
    if (localVote) {
      setStatus("Consensus already recorded for this market state.");
      return;
    }
    if (consensus && !consensus.open) {
      setStatus("Consensus is closed for this market state.");
      return;
    }
    if (!ready) {
      setStatus("Profile login is loading.");
      return;
    }
    if (!authenticated || !user) {
      setStatus("Sign in with X to join Echo Consensus.");
      login();
      return;
    }
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setStatus("Could not verify your X profile. Please sign in again.");
      return;
    }
    let walletAddress: string | null = null;
    let signature: string | null = null;
    const message = `I expect ${voteValue.toLowerCase()} 4H outcome for this Perpl Echo market state: ${props.analysisHash}`;
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

    const response = await fetch("/api/echo-vote", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        analysisHash: props.analysisHash,
        symbol: props.symbol,
        snapshotTimestamp: props.timestamp,
        horizonHours: HORIZON_HOURS,
        voteValue,
        browserId: browserId(),
        privyUserId: user.id,
        twitter: user.twitter,
        walletAddress,
        signature,
        message
      })
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setConsensus(data?.consensus ?? consensus);
      setStatus(data?.error ?? "Consensus could not be recorded.");
      return;
    }

    const votes = readConsensusVotes();
    votes[consensusKey] = voteValue;
    localStorage.setItem(CONSENSUS_KEY, JSON.stringify(votes));
    setLocalVote(voteValue);
    setConsensus(data.consensus);
    setStatus(sign ? "Signed consensus saved. No transaction was sent." : "Your 4H view is saved to your X profile.");
  }

  return (
    <div className="space-y-5">
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
      </div>

      <div className="space-y-3 rounded-sm border border-border bg-background/40 p-4">
        <div>
          <div className="text-sm font-semibold">Echo Consensus</div>
          <div className="text-xs text-muted-foreground">What does the community expect over the next 4 hours?</div>
        </div>
        <ProfileStatus ready={ready} authenticated={authenticated} user={user} onLogin={login} />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={localVote === "BULLISH" ? "default" : "secondary"}
            disabled={Boolean(localVote) || consensus?.open === false}
            onClick={() => submitConsensus("BULLISH")}
          >
            <TrendingUp className="h-4 w-4" />
            Bullish 4H
          </Button>
          <Button
            type="button"
            variant={localVote === "BEARISH" ? "default" : "secondary"}
            disabled={Boolean(localVote) || consensus?.open === false}
            onClick={() => submitConsensus("BEARISH")}
          >
            <TrendingDown className="h-4 w-4" />
            Bearish 4H
          </Button>
        </div>
        {walletEnabled ? (
          <Button type="button" variant="ghost" disabled={Boolean(localVote) || consensus?.open === false} onClick={() => submitConsensus(localVote ?? "BULLISH", true)}>
            <Wallet className="h-4 w-4" />
            Sign Consensus
          </Button>
        ) : null}
        <ConsensusSummary consensus={consensus} localVote={localVote} />
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

function ConsensusSummary({ consensus, localVote }: { consensus: ConsensusState | null; localVote: ConsensusVote | null }) {
  if (!consensus) return <div className="text-xs text-muted-foreground">Loading consensus...</div>;
  return (
    <div className="grid gap-2 text-xs text-muted-foreground">
      <div>
        Bullish {pct(consensus.bullishPercent, 0)} / Bearish {pct(consensus.bearishPercent, 0)} · {consensus.totalVotes} total
      </div>
      <div>{consensus.open ? `Voting open · ${formatRemaining(consensus.timeRemainingSeconds)} remaining` : "Voting closed"}</div>
      {localVote ? <div>Your expectation: {localVote === "BULLISH" ? "Bullish 4H" : "Bearish 4H"}</div> : null}
      {!consensus.open ? (
        <div>
          Actual 4H move: {pct(consensus.actualReturnPercent, 2)} · Outcome {consensus.actualOutcome ?? "Unavailable"} · Community{" "}
          {consensus.communityResult ? resultLabel(consensus.communityResult) : "Pending"}
        </div>
      ) : null}
    </div>
  );
}

function ProfileStatus({
  ready,
  authenticated,
  user,
  onLogin
}: {
  ready: boolean;
  authenticated: boolean;
  user: User | null | undefined;
  onLogin: () => void;
}) {
  if (!ready) return <div className="rounded-sm border border-border bg-background/45 p-3 text-xs text-muted-foreground">Loading X login...</div>;
  if (!authenticated || !user) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border bg-background/45 p-3">
        <div className="text-xs text-muted-foreground">Sign in with X to attach your 4H view to a public profile.</div>
        <Button type="button" variant="secondary" size="sm" onClick={onLogin}>
          <UserRound className="h-4 w-4" />
          Sign in with X
        </Button>
      </div>
    );
  }
  const twitter = user.twitter;
  return (
    <div className="flex items-center gap-3 rounded-sm border border-border bg-background/45 p-3">
      {twitter?.profilePictureUrl ? (
        <Image src={twitter.profilePictureUrl} alt="" width={32} height={32} className="h-8 w-8 rounded-full border border-border" />
      ) : (
        <UserRound className="h-6 w-6 text-muted-foreground" />
      )}
      <div className="min-w-0 text-xs">
        <div className="truncate font-semibold text-foreground">{twitter?.name ?? twitter?.username ?? "Signed in"}</div>
        {twitter?.username ? <div className="truncate text-muted-foreground">@{twitter.username}</div> : null}
      </div>
    </div>
  );
}

function readConsensusVotes(): Record<string, ConsensusVote> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(CONSENSUS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function browserId() {
  const existing = localStorage.getItem(BROWSER_ID_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  localStorage.setItem(BROWSER_ID_KEY, next);
  return next;
}

function formatRemaining(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function resultLabel(result: NonNullable<ConsensusState["communityResult"]>) {
  if (result === "CORRECT") return "Correct";
  if (result === "WRONG") return "Wrong";
  return "Mixed";
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
