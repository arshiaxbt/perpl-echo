import { defineChain, stringToHex } from "viem";

export const MONAD_MAINNET_CHAIN_ID = Number(process.env.NEXT_PUBLIC_MONAD_CHAIN_ID ?? "143");
export const MONAD_MAINNET_RPC_URL = process.env.NEXT_PUBLIC_MONAD_RPC_URL ?? "https://rpc.monad.xyz";
export const MONAD_MAINNET_EXPLORER_URL = process.env.NEXT_PUBLIC_MONAD_EXPLORER_URL ?? "https://monadscan.com";

export const monadMainnet = defineChain({
  id: MONAD_MAINNET_CHAIN_ID,
  name: "Monad Mainnet",
  nativeCurrency: {
    name: "MON",
    symbol: "MON",
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: [MONAD_MAINNET_RPC_URL]
    },
    public: {
      http: [MONAD_MAINNET_RPC_URL]
    }
  },
  blockExplorers: {
    default: {
      name: "Monadscan",
      url: MONAD_MAINNET_EXPLORER_URL
    }
  }
});

export function monadTxUrl(hash?: string | null) {
  return hash ? `${MONAD_MAINNET_EXPLORER_URL.replace(/\/$/, "")}/tx/${hash}` : null;
}

export type EchoVotePayload = {
  app: "Perpl Echo";
  type: "ECHO_CONSENSUS_4H";
  analysisHash: string;
  symbol: string;
  snapshotTimestamp: string;
  voteValue: "BULLISH" | "BEARISH";
};

export function echoVotePayload(input: Omit<EchoVotePayload, "app" | "type">): EchoVotePayload {
  return {
    app: "Perpl Echo",
    type: "ECHO_CONSENSUS_4H",
    ...input,
    symbol: input.symbol.toUpperCase()
  };
}

export function encodeEchoVote(input: Omit<EchoVotePayload, "app" | "type">) {
  return stringToHex(JSON.stringify(echoVotePayload(input)));
}
