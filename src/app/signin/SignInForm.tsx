'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Two-step sign-in that never leaves the (standalone) app: request a code,
 * then type the 8-digit code from the email. Sidesteps the iOS limitation
 * where a magic-link tap always opens Safari instead of the installed PWA.
 * The emailed link still works as a fallback for anyone on desktop.
 */
export function SignInForm({ initialError }: { initialError: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        setError("We couldn't send the code. Try again in a moment.");
        return;
      }
      setStep('code');
    } catch {
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (busy || code.trim().length !== 8) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        const reason = j?.error;
        setError(
          reason === 'expired'
            ? 'That code expired. Request a new one.'
            : reason === 'used'
              ? 'That code was already used. Request a new one.'
              : 'That code is invalid. Check it and try again.',
        );
        return;
      }
      // Session cookie is set for this (standalone) context — go home.
      router.replace('/');
      router.refresh();
    } catch {
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (step === 'code') {
    return (
      <form onSubmit={verifyCode} className="mt-6 space-y-3">
        <div className="rounded-lg border border-border bg-muted px-4 py-3 text-sm">
          <p className="font-medium">Check your email.</p>
          <p className="mt-1 text-muted-foreground">
            We sent an 8-digit code to{' '}
            <span className="text-foreground">{email}</span>. Enter it
            below — you&apos;ll stay right here in the app.
          </p>
        </div>
        <input
          value={code}
          onChange={(ev) => setCode(ev.target.value.replace(/\D/g, '').slice(0, 8))}
          required
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="12345678"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-center text-2xl tracking-[0.3em] outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={busy || code.length !== 8}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Verifying…' : 'Sign in'}
        </button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="button"
          onClick={() => {
            setStep('email');
            setCode('');
            setError(null);
          }}
          className="w-full text-xs text-muted-foreground hover:text-foreground"
        >
          ← Use a different email
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={requestCode} className="mt-6 space-y-3">
      <input
        type="email"
        value={email}
        onChange={(ev) => setEmail(ev.target.value)}
        required
        autoFocus
        autoComplete="email"
        inputMode="email"
        placeholder="you@example.com"
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
      />
      <button
        type="submit"
        disabled={busy || !email.trim()}
        className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'Sending…' : 'Email me a sign-in code'}
      </button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
