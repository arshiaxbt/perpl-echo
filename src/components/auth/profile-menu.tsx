"use client";

import Image from "next/image";
import { useEffect } from "react";
import { LogOut, UserRound } from "lucide-react";
import { getAccessToken, usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";

export function ProfileMenu() {
  const { ready, authenticated, user, login, logout, connectOrCreateWallet } = usePrivy();
  const twitter = user?.twitter;
  const username = twitter?.username ? `@${twitter.username}` : null;
  const displayName = twitter?.name ?? username ?? "Perpl Echo user";

  useEffect(() => {
    if (!ready || !authenticated || !user) return;
    getAccessToken()
      .then((token) => {
        if (!token) return null;
        return fetch("/api/profile", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            privyUserId: user.id,
            twitter: user.twitter
          })
        });
      })
      .catch(() => undefined);
  }, [authenticated, ready, user]);

  if (!ready) {
    return (
      <Button variant="secondary" size="sm" disabled>
        Loading
      </Button>
    );
  }

  if (!authenticated) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={login}>
        <UserRound className="h-4 w-4" />
        Sign in with X
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={connectOrCreateWallet}
        className="flex max-w-[180px] items-center gap-2 rounded-sm border border-border bg-secondary px-2 py-1.5 text-xs text-foreground hover:border-primary/45"
      >
        {twitter?.profilePictureUrl ? (
          <Image
            src={twitter.profilePictureUrl}
            alt=""
            width={24}
            height={24}
            className="h-6 w-6 rounded-full border border-border"
          />
        ) : (
          <UserRound className="h-5 w-5 text-muted-foreground" />
        )}
        <span className="min-w-0">
          <span className="block truncate font-semibold">{displayName}</span>
          {username ? <span className="block truncate text-muted-foreground">{username}</span> : null}
        </span>
      </button>
      <Button type="button" variant="ghost" size="icon" aria-label="Sign out" onClick={logout}>
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}
