import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonSafePublic } from "@/lib/json";
import { prisma } from "@/lib/prisma";
import { verifyPrivyRequest } from "@/lib/privy-auth";
import { upsertUserProfile } from "@/lib/user-profile";

const profileSchema = z.object({
  privyUserId: z.string().min(8),
  twitter: z
    .object({
      subject: z.string().optional().nullable(),
      username: z.string().optional().nullable(),
      name: z.string().optional().nullable(),
      profilePictureUrl: z.string().url().optional().nullable()
    })
    .optional()
    .nullable()
});

export async function GET(request: Request) {
  const verified = await verifyPrivyRequest(request);
  if (!verified) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const profile = await prisma.userProfile.findUnique({
    where: { privyUserId: verified.privyUserId },
    select: publicProfileSelect
  });
  return NextResponse.json(jsonSafePublic({ profile }));
}

export async function POST(request: Request) {
  const verified = await verifyPrivyRequest(request);
  if (!verified) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.privyUserId !== verified.privyUserId) {
    return NextResponse.json({ error: "Invalid profile payload" }, { status: 400 });
  }
  const profile = await upsertUserProfile({
    privyUserId: verified.privyUserId,
    twitter: parsed.data.twitter,
    rawJson: parsed.data
  });
  return NextResponse.json(jsonSafePublic({ profile: publicProfile(profile) }));
}

const publicProfileSelect = {
  id: true,
  privyUserId: true,
  twitterUsername: true,
  twitterName: true,
  twitterImageUrl: true,
  createdAt: true,
  updatedAt: true
};

function publicProfile(profile: {
  id: string;
  privyUserId: string;
  twitterUsername: string | null;
  twitterName: string | null;
  twitterImageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: profile.id,
    privyUserId: profile.privyUserId,
    twitterUsername: profile.twitterUsername,
    twitterName: profile.twitterName,
    twitterImageUrl: profile.twitterImageUrl,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt
  };
}
