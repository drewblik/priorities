import { randomBytes, createHash } from 'node:crypto';
import { and, eq, isNull, lt } from 'drizzle-orm';
import { db } from '@/db/client';
import { magicLinkTokens, users, type User } from '@/db/schema';
import { newId } from '@/lib/id';
import { sendMagicLinkEmail } from '@/lib/email';

const TOKEN_BYTES = 24;
const MAGIC_LINK_TTL_MIN = 15;
const CLEANUP_THRESHOLD_HOURS = 24;

function generateMagicLinkToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
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

  const token = generateMagicLinkToken();
  const tokenHash = hashToken(token);
  const expiresAt = minutesFromNow(MAGIC_LINK_TTL_MIN);

  await db.insert(magicLinkTokens).values({
    id: newId('mlt'),
    email,
    tokenHash,
    expiresAt,
  });

  const url = `${getSiteUrl()}/api/auth/callback?token=${encodeURIComponent(token)}`;
  await sendMagicLinkEmail(email, url);
}

export type MagicLinkVerification =
  | { ok: true; user: User }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' };

export async function verifyMagicLink(rawToken: string): Promise<MagicLinkVerification> {
  if (!rawToken) return { ok: false, reason: 'invalid' };
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const rows = await db
    .select()
    .from(magicLinkTokens)
    .where(eq(magicLinkTokens.tokenHash, tokenHash))
    .limit(1);

  const record = rows[0];
  if (!record) return { ok: false, reason: 'invalid' };
  if (record.usedAt) return { ok: false, reason: 'used' };
  if (record.expiresAt <= now) return { ok: false, reason: 'expired' };

  // Atomic single-use guard: only flip used_at if it's still null.
  const claimed = await db
    .update(magicLinkTokens)
    .set({ usedAt: now })
    .where(and(eq(magicLinkTokens.id, record.id), isNull(magicLinkTokens.usedAt)))
    .returning({ id: magicLinkTokens.id });

  if (claimed.length === 0) {
    return { ok: false, reason: 'used' };
  }

  // Find or create the user.
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, record.email))
    .limit(1);

  let user = existing[0];
  if (!user) {
    const id = newId('usr');
    const inserted = await db
      .insert(users)
      .values({ id, email: record.email })
      .returning();
    user = inserted[0]!;
  }

  if (user.deletedAt) {
    return { ok: false, reason: 'invalid' };
  }

  return { ok: true, user };
}
