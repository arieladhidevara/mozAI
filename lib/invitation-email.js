/* Server-side transactional invite email delivery. Never expose API credentials or invitation tokens to logs. */
const SENDER = 'mozAI <invites@mozai.cc>';

const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

async function sendInvitationEmail({email, label, token, id, origin}) {
  if (!email) return {status: 'not_requested'};
  const key = process.env.RESEND_API_KEY;
  if (!key) return {status: 'not_configured'};
  let url;
  try {
    url = new URL('/#invite=' + encodeURIComponent(token), origin);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid origin');
  } catch {
    return {status: 'failed'};
  }
  const name = String(label || '').trim().replace(/\s+/g, ' ').slice(0, 64);
  const greeting = name ? 'Hi ' + name + ',' : 'Hi,';
  const subject = "You're invited to try mozAI";
  const text = greeting + '\n\nYou\'ve been invited to try mozAI, an AI visualization tool for designers.\n\nOpen your personal invitation link to get started:\n' + url.href + '\n\nThis link expires according to the invitation settings. If you were not expecting this invitation, you can ignore this email.\n\nmozAI';
  const html = '<div style="font-family:Arial,sans-serif;max-width:540px;margin:0 auto;color:#201f2a;line-height:1.6">'
    + '<h2 style="font-size:24px">You are invited to mozAI</h2>'
    + '<p>' + escapeHtml(greeting) + '</p>'
    + '<p>You\'ve been invited to try <strong>mozAI</strong>, an AI visualization tool for designers.</p>'
    + '<p><a href="' + escapeHtml(url.href) + '" style="display:inline-block;background:#6046e8;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px">Accept invitation</a></p>'
    + '<p style="font-size:13px;color:#6a6877">Your personal invitation link expires according to the invitation settings. If you were not expecting this email, you can ignore it.</p>'
    + '<p>mozAI</p></div>';
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'mozai-invite-' + id
      },
      body: JSON.stringify({from: process.env.MOSAIC_INVITE_FROM || SENDER, to: [email], subject, text, html}),
      signal: AbortSignal.timeout(12000)
    });
    return {status: response.ok ? 'sent' : 'failed'};
  } catch {
    return {status: 'failed'};
  }
}
module.exports = {sendInvitationEmail};
