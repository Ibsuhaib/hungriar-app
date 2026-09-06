/**
 * OTP codes are stored as a digest, never in cleartext. The phone number is
 * mixed into the input so one rainbow table cannot cover every row's 1e6
 * possible six-digit codes at once.
 *
 * Both send-otp and verify-otp must use this helper or codes will never match.
 */
export async function hashOtp(phoneNumber: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(`${phoneNumber}:${code}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
