import { NextResponse } from 'next/server';
import { signOutCurrentSession } from '@/auth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  await signOutCurrentSession();
  const url = new URL(req.url);
  return NextResponse.redirect(`${url.origin}/signin`, 303);
}
