import { createPublicClient, getAddress, hexToString, http, isAddressEqual, type Hex } from "viem";
import { echoVotePayload, monadMainnet, MONAD_MAINNET_CHAIN_ID, MONAD_MAINNET_RPC_URL, type EchoVotePayload } from "./monad-chain";

type VerifyEchoVoteInput = Omit<EchoVotePayload, "app" | "type"> & {
  txHash: Hex;
  walletAddress: string;
  chainId: number;
};

const client = createPublicClient({
  chain: monadMainnet,
  transport: http(process.env.MONAD_RPC_URL || MONAD_MAINNET_RPC_URL, {
    retryCount: 2,
    timeout: 8_000
  })
});

export async function verifyOnchainEchoVote(input: VerifyEchoVoteInput) {
  if (input.chainId !== MONAD_MAINNET_CHAIN_ID) throw new Error("Wrong Monad network.");

  const expectedWallet = getAddress(input.walletAddress);
  const transaction = await getTransactionWithRetry(input.txHash);
  if (!transaction.to || !isAddressEqual(transaction.from, expectedWallet) || !isAddressEqual(transaction.to, expectedWallet)) {
    throw new Error("Transaction wallet does not match the signed-in Privy wallet.");
  }
  if (transaction.value !== 0n) throw new Error("Echo Consensus transactions must send 0 MON.");

  let payload: unknown;
  try {
    payload = JSON.parse(hexToString(transaction.input));
  } catch {
    throw new Error("Transaction does not contain a valid Echo Consensus record.");
  }

  const expected = echoVotePayload({
    analysisHash: input.analysisHash,
    symbol: input.symbol,
    snapshotTimestamp: input.snapshotTimestamp,
    voteValue: input.voteValue
  });
  if (JSON.stringify(payload) !== JSON.stringify(expected)) {
    throw new Error("Transaction record does not match this market state and vote.");
  }
}

async function getTransactionWithRetry(hash: Hex) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await client.getTransaction({ hash });
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Monad transaction is not available yet.");
}
