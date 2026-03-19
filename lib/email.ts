// Email sending helper using Resend.
// Used for password reset emails.

import { Resend } from "resend";

// Lazy initialization — Resend throws if API key is missing at construction time.
// This lets the app build and start even without the key set.
function getResend(): Resend {
  return new Resend(process.env.RESEND_API_KEY);
}

// The domain where the app is reachable (with basePath)
function getAppUrl(): string {
  // On Vercel, use the deployment URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/aerovision`;
  }
  // Custom domain override
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  // Local dev fallback
  return "http://localhost:3000/aerovision";
}

// Send a password reset email with a link to set a new password
export async function sendPasswordResetEmail(
  email: string,
  token: string,
  name: string | null
): Promise<void> {
  const appUrl = getAppUrl();
  const resetLink = `${appUrl}/reset-password?token=${token}`;
  const greeting = name ? `Hi ${name}` : "Hi";

  // If no API key is set (local dev), just log to console
  if (!process.env.RESEND_API_KEY) {
    console.log("[Email] Password reset link (no RESEND_API_KEY):", resetLink);
    return;
  }

  const fromAddress = process.env.RESEND_FROM_ADDRESS || "AeroVision <noreply@mechanicalvisioncorp.com>";

  await getResend().emails.send({
    from: fromAddress,
    to: email,
    subject: "Reset your AeroVision password",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #1a1a1a; margin-bottom: 24px;">Reset your password</h2>
        <p style="color: #444; line-height: 1.6;">${greeting},</p>
        <p style="color: #444; line-height: 1.6;">
          We received a request to reset your AeroVision password. Click the button below to choose a new one.
        </p>
        <div style="margin: 32px 0;">
          <a href="${resetLink}" style="display: inline-block; background: #1a1a1a; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 500;">
            Reset Password
          </a>
        </div>
        <p style="color: #888; font-size: 14px; line-height: 1.6;">
          This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
        <p style="color: #aaa; font-size: 12px;">The Mechanical Vision Corporation</p>
      </div>
    `,
  });
}
