import { randomInt, createHash } from 'node:crypto';
import { and, eq, isNull, lt } from 'drizzle-orm';
import { db } from '@/db/client';
import { magicLinkTokens, users, type User } from '@/db/schema';
import { newId } from '@/lib/id';
import { sendMagicLinkEmail } from '@/lib/email';

const MAGIC_LINK_TTL_MIN = 15;
const CLEANUP_THRESHOLD_HOURS = 24;

/**
 * 8-digit numeric code. Doubles as the email-link token AND the in-app
 * code so one credential covers both flows. 100M space + 15-min
 * single-use TTL + single-user posture (TDD: no endpoint rate limiting in
 * v1) makes online brute force impractical. Numeric so it's one-handed on
 * a phone numeric keypad.
 */
function generateMagicLinkCode(): string {
  return randomInt(0, 100_000_000).toString().padStart(8, '0');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function minutesFromNow(min: number): Date {
  return new Date(Date.now() + min * 60 * 1000);
}

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

function getSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) throw new Error('NEXT_PUBLIC_SITE_URL is not set');
  return url.replace(/\/$/, '');
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function issueAndSendMagicLink(rawEmail: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  if (!email.includes('@') || email.length > 320) {
    throw new Error('Invalid email');
  }

  // Lazy cleanup: remove tokens older than 24h (stale either way — used or expired).
  await db
    .delete(magicLinkTokens)
    .where(lt(magicLinkTokens.createdAt, hoursAgo(CLEANUP_THRESHOLD_HOURS)));

  const code = generateMagicLinkCode();
  const tokenHash = hashToken(code);
  const expiresAt = minutesFromNow(MAGIC_LINK_TTL_MIN);

  await db.insert(magicLinkTokens).values({
    id: newId('mlt'),
    email,
    tokenHash,
    expiresAt,
  });

  const url = `${getSiteUrl()}/api/auth/callback?token=${encodeURIComponent(code)}`;
  await sendMagicLinkEmail(email, url, code);
}

export type MagicLinkVerification =
  | { ok: true; user: User }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' };

/** Shared: claim a found token row single-use, then find/create the user. */
async function claimAndResolveUser(record: {
  id: string;
  email: string;
  usedAt: Date | null;
  expiresAt: Date;
}): Promise<MagicLinkVerification> {
  const now = new Date();
  if (record.usedAt) return { ok: false, reason: 'used' };
  if (record.expiresAt <= now) return { ok: false, reason: 'expired' };

  const claimed = await db
    .update(magicLinkTokens)
    .set({ usedAt: now })
    .where(and(eq(magicLinkTokens.id, record.id), isNull(magicLinkTokens.usedAt)))
    .returning({ id: magicLinkTokens.id });
  if (claimed.length === 0) return { ok: false, reason: 'used' };

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, record.email))
    .limit(1);
  let user = existing[0];
  if (!user) {
    const inserted = await db
      .insert(users)
      .values({ id: newId('usr'), email: record.email })
      .returning();
    user = inserted[0]!;
  }
  if (user.deletedAt) return { ok: false, reason: 'invalid' };
  return { ok: true, user };
}

/** Email-link path: token comes from the URL; looked up by hash alone. */
export async function verifyMagicLink(rawToken: string): Promise<MagicLinkVerification> {
  if (!rawToken) return { ok: false, reason: 'invalid' };
  const rows = await db
    .select()
    .from(magicLinkTokens)
    .where(eq(magicLinkTokens.tokenHash, hashToken(rawToken)))
    .limit(1);
  const record = rows[0];
  if (!record) return { ok: false, reason: 'invalid' };
  return claimAndResolveUser(record);
}

/**
 * In-app code path: the user types the 8-digit code without leaving the
 * PWA. Scoped by email so short numeric codes can't collide across users.
 */
export async function verifyMagicLinkCode(
  rawEmail: string,
  rawCode: string,
): Promise<MagicLinkVerification> {
  const email = normalizeEmail(rawEmail);
  const code = (rawCode ?? '').trim();
  if (!email.includes('@') || !/^\d{8}$/.test(code)) {
    return { ok: false, reason: 'invalid' };
  }
  const rows = await db
    .select()
    .from(magicLinkTokens)
    .where(
      and(
        eq(magicLinkTokens.email, email),
        eq(magicLinkTokens.tokenHash, hashToken(code)),
      ),
    )
    .limit(1);
  const record = rows[0];
  if (!record) return { ok: false, reason: 'invalid' };
  return claimAndResolveUser(record);
}
