import { prisma } from "@/lib/prisma";

export type TwitterProfileInput = {
  subject?: string | null;
  username?: string | null;
  name?: string | null;
  profilePictureUrl?: string | null;
};

export async function upsertUserProfile(input: {
  privyUserId: string;
  twitter?: TwitterProfileInput | null;
  rawJson?: unknown;
}) {
  const twitter = input.twitter ?? null;
  return prisma.userProfile.upsert({
    where: { privyUserId: input.privyUserId },
    create: {
      privyUserId: input.privyUserId,
      twitterSubject: clean(twitter?.subject),
      twitterUsername: cleanHandle(twitter?.username),
      twitterName: clean(twitter?.name),
      twitterImageUrl: clean(twitter?.profilePictureUrl),
      rawJson: sanitizeRaw(input.rawJson ?? { twitter })
    },
    update: {
      twitterSubject: clean(twitter?.subject),
      twitterUsername: cleanHandle(twitter?.username),
      twitterName: clean(twitter?.name),
      twitterImageUrl: clean(twitter?.profilePictureUrl),
      rawJson: sanitizeRaw(input.rawJson ?? { twitter })
    }
  });
}

export function publicProfileName(profile: {
  twitterName?: string | null;
  twitterUsername?: string | null;
  privyUserId?: string | null;
}) {
  return profile.twitterName ?? (profile.twitterUsername ? `@${profile.twitterUsername}` : shortId(profile.privyUserId));
}

function clean(value?: string | null) {
  const next = value?.trim();
  return next ? next.slice(0, 300) : null;
}

function cleanHandle(value?: string | null) {
  return clean(value)?.replace(/^@/, "") ?? null;
}

function shortId(value?: string | null) {
  if (!value) return "Perpl Echo user";
  return `${value.slice(0, 10)}...${value.slice(-4)}`;
}

function sanitizeRaw(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null));
}
