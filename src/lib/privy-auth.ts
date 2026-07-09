import { createRemoteJWKSet, jwtVerify } from "jose";

const DEFAULT_PRIVY_APP_ID = "cmrdcjfsa01bp0cjv5nd3yk20";

const appId = process.env.PRIVY_APP_ID ?? process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? DEFAULT_PRIVY_APP_ID;
const jwksUrl = process.env.PRIVY_JWKS_URL ?? `https://auth.privy.io/api/v1/apps/${appId}/jwks.json`;
const jwks = createRemoteJWKSet(new URL(jwksUrl));

export type VerifiedPrivyUser = {
  privyUserId: string;
};

export async function verifyPrivyRequest(request: Request): Promise<VerifiedPrivyUser | null> {
  const token = bearerToken(request);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: "privy.io",
      audience: appId
    });
    if (!payload.sub) return null;
    return { privyUserId: payload.sub };
  } catch {
    return null;
  }
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) return authorization.slice(7).trim();
  const cookie = request.headers.get("cookie");
  const match = cookie?.match(/(?:^|;\s*)privy-token=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
