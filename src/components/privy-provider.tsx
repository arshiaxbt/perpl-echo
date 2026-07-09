"use client";

import { PrivyProvider } from "@privy-io/react-auth";

export function AppPrivyProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "cmrdcjfsa01bp0cjv5nd3yk20";

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["twitter"],
        appearance: {
          theme: "dark",
          accentColor: "#836EF9",
          logo: "https://raw.githubusercontent.com/arshiaxbt/perpl-echo/main/perpl-echo.png"
        }
      }}
    >
      {children}
    </PrivyProvider>
  );
}
