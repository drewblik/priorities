import { Resend } from 'resend';

let cached: Resend | null = null;

function getResend(): Resend {
  if (cached) return cached;
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not set');
  }
  cached = new Resend(process.env.RESEND_API_KEY);
  return cached;
}

export async function sendMagicLinkEmail(
  to: string,
  magicLinkUrl: string,
  code: string,
): Promise<void> {
  const from = process.env.EMAIL_FROM ?? 'Priorities <onboarding@resend.dev>';

  const { error } = await getResend().emails.send({
    from,
    to,
    subject: `Your Priorities sign-in code: ${code}`,
    text: [
      `Your sign-in code is: ${code}`,
      '',
      'Enter this code in the Priorities app (best if you added it to your',
      'home screen — you stay in the app).',
      '',
      'Or tap this link to sign in directly:',
      magicLinkUrl,
      '',
      'The code and link expire in 15 minutes and can only be used once.',
      '',
      "If you didn't request this, you can ignore the email.",
    ].join('\n'),
  });

  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
}
