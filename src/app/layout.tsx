import type { Metadata } from "next";
import Link from "next/link";
import { Activity, Bookmark, Database, Home, UsersRound } from "lucide-react";
import { BrandLogo, PERPL_ECHO_LOGO_URL } from "@/components/brand-logo";
import { ProfileMenu } from "@/components/auth/profile-menu";
import { AppPrivyProvider } from "@/components/privy-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Perpl Echo",
  description: "Historical market intelligence for Perpl.",
  icons: {
    icon: PERPL_ECHO_LOGO_URL,
    apple: PERPL_ECHO_LOGO_URL
  },
  openGraph: {
    title: "Perpl Echo",
    description: "Historical market intelligence for Perpl.",
    images: [PERPL_ECHO_LOGO_URL]
  },
  twitter: {
    card: "summary",
    title: "Perpl Echo",
    description: "Historical market intelligence for Perpl.",
    images: [PERPL_ECHO_LOGO_URL]
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <AppPrivyProvider>
        <div className="monad-grid min-h-screen bg-[radial-gradient(circle_at_18%_0%,hsl(264_96%_24%/.72),transparent_34%),radial-gradient(circle_at_90%_12%,hsl(42_95%_24%/.34),transparent_22%),linear-gradient(180deg,hsl(252_45%_4%),hsl(255_38%_6%)_42%,hsl(252_45%_4%))]">
          <header className="border-b border-border/80 bg-background/80 backdrop-blur-xl">
            <div className="container flex min-h-16 flex-wrap items-center justify-between gap-3 py-3">
              <Link href="/" className="flex items-center gap-3 font-semibold">
                <BrandLogo className="h-9 w-9 border border-primary/50 bg-primary/15 p-1 shadow-[0_0_32px_hsl(var(--primary)/0.28)]" priority />
                <span className="tracking-wide">Perpl Echo</span>
              </Link>
              <nav className="flex items-center gap-2 text-sm text-muted-foreground">
                <Link className="flex items-center gap-1 rounded-sm border border-transparent px-3 py-2 uppercase text-[11px] tracking-[0.16em] hover:border-border hover:bg-muted hover:text-foreground" href="/">
                  <Home className="h-4 w-4" />
                  Home
                </Link>
                <Link className="flex items-center gap-1 rounded-sm border border-transparent px-3 py-2 uppercase text-[11px] tracking-[0.16em] hover:border-border hover:bg-muted hover:text-foreground" href="/markets">
                  <Activity className="h-4 w-4" />
                  Markets
                </Link>
                <Link className="flex items-center gap-1 rounded-sm border border-transparent px-3 py-2 uppercase text-[11px] tracking-[0.16em] hover:border-border hover:bg-muted hover:text-foreground" href="/bookmarks">
                  <Bookmark className="h-4 w-4" />
                  Bookmarks
                </Link>
                <Link className="flex items-center gap-1 rounded-sm border border-transparent px-3 py-2 uppercase text-[11px] tracking-[0.16em] hover:border-border hover:bg-muted hover:text-foreground" href="/profiles">
                  <UsersRound className="h-4 w-4" />
                  Profiles
                </Link>
                <Link className="flex items-center gap-1 rounded-sm border border-transparent px-3 py-2 uppercase text-[11px] tracking-[0.16em] hover:border-border hover:bg-muted hover:text-foreground" href="/status">
                  <Database className="h-4 w-4" />
                  Status
                </Link>
                <ProfileMenu />
              </nav>
            </div>
          </header>
          <main className="container py-6 md:py-8">{children}</main>
          <footer className="container pb-8 pt-2 text-xs text-muted-foreground">
            <div className="border-t border-border/70 pt-5">
              Created by{" "}
              <a className="font-semibold text-primary hover:text-primary/80" href="https://x.com/0xarshia" rel="noreferrer" target="_blank">
                @0xarshia
              </a>
            </div>
          </footer>
        </div>
        </AppPrivyProvider>
      </body>
    </html>
  );
}
