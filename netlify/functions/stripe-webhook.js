// netlify/functions/stripe-webhook.js
// Handles Stripe checkout.session.completed → Brevo list + transactional email

const crypto = require('crypto');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // ── Verify Stripe Signature ──
  const sig = event.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;
  try {
    stripeEvent = verifyStripeSignature(event.body, sig, endpointSecret);
  } catch (err) {
    console.error('Signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // ── Only process checkout.session.completed ──
  if (stripeEvent.type !== 'checkout.session.completed') {
    return { statusCode: 200, body: 'Event ignored' };
  }

  const session = stripeEvent.data.object;
  const email = session.customer_details?.email || session.customer_email;
  const name = session.customer_details?.name || '';

  if (!email) {
    console.error('No email found in session');
    return { statusCode: 400, body: 'No customer email' };
  }

  console.log(`Processing purchase for: ${email}`);

  try {
    // ── 1. Add contact to Brevo list "CASHFLOW48" ──
    await addToBrevo(email, name);

    // ── 2. Send transactional email with download links ──
    await sendBrevoEmail(email, name);

    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    console.error('Processing error:', err);
    return { statusCode: 500, body: 'Internal error' };
  }
};

// ── Stripe Signature Verification ──
function verifyStripeSignature(payload, sigHeader, secret) {
  const elements = sigHeader.split(',');
  const timestamp = elements.find(e => e.startsWith('t=')).split('=')[1];
  const signature = elements.find(e => e.startsWith('v1=')).split('=')[1];

  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  if (signature !== expectedSignature) {
    throw new Error('Invalid signature');
  }

  // Check timestamp (5 min tolerance)
  const now = Math.floor(Date.now() / 1000);
  if (now - parseInt(timestamp) > 300) {
    throw new Error('Timestamp too old');
  }

  return JSON.parse(payload);
}

// ── Brevo: Add Contact to List ──
async function addToBrevo(email, name) {
  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  const BREVO_LIST_ID = parseInt(process.env.BREVO_LIST_ID || '0');

  const nameParts = name.split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  const response = await fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'api-key': BREVO_API_KEY,
    },
    body: JSON.stringify({
      email: email,
      attributes: {
        VORNAME: firstName,
        NACHNAME: lastName,
        PRODUKT: 'CASHFLOW48',
      },
      listIds: [BREVO_LIST_ID],
      updateEnabled: true,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('Brevo contact error:', err);
    // Don't throw — contact might already exist, email should still go out
  }

  console.log(`Brevo: Contact ${email} added/updated`);
}

// ── Brevo: Send Transactional Email ──
async function sendBrevoEmail(email, name) {
  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  const firstName = name.split(' ')[0] || 'dort';

  // ─────────────────────────────────────────────
  // DOWNLOAD LINKS — Replace with your Bunny.net URLs
  // ─────────────────────────────────────────────
  const EBOOK_URL = process.env.EBOOK_DOWNLOAD_URL || 'https://cashflow48.online/danke.html';
  const DANKE_URL = 'https://cashflow48.online/danke.html';

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'api-key': BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: {
        name: 'CASHFLOW 48',
        email: 'hallo@higherplan.co',
      },
      to: [{ email: email, name: name || email }],
      subject: 'Dein Zugang — CASHFLOW 48',
      htmlContent: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 24px; color: #1d1d1f;">
          
          <div style="font-size: 12px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #86868b; margin-bottom: 24px;">CASHFLOW 48 · LIBRYX PROGRAM</div>
          
          <h1 style="font-size: 28px; font-weight: 400; margin-bottom: 16px; color: #1d1d1f;">Hey ${firstName} — du bist drin.</h1>
          
          <p style="font-size: 15px; line-height: 1.6; color: #6e6e73; margin-bottom: 32px;">Deine Zahlung war erfolgreich. Hier ist dein Zugang zu allen Inhalten — eBook, Videos, Prompts. Alles an einem Ort.</p>
          
          <a href="${DANKE_URL}" style="display: inline-block; padding: 14px 32px; background: #0071e3; color: white; text-decoration: none; border-radius: 980px; font-size: 15px; font-weight: 500; margin-bottom: 32px;">Zu deinen Downloads</a>
          
          <div style="border-top: 1px solid #e8e8ed; padding-top: 24px; margin-top: 16px;">
            <p style="font-size: 13px; line-height: 1.6; color: #86868b;">Tipp: Lade alles jetzt runter und speichere es lokal. Die Links bleiben aktiv, aber sicher ist sicher.</p>
            <p style="font-size: 13px; line-height: 1.6; color: #86868b; margin-top: 12px;">Fragen? Antworte einfach auf diese Mail oder schreib an <a href="mailto:hallo@higherplan.co" style="color: #0071e3; text-decoration: none;">hallo@higherplan.co</a></p>
          </div>
          
          <div style="margin-top: 40px; font-size: 11px; color: #86868b;">
            CASHFLOW 48 · Ein LibryX Program<br>
            HIGHERPlan GmbH · Dorfstraße 43 · 39539 Havelberg
          </div>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('Brevo email error:', err);
    throw new Error('Failed to send email');
  }

  console.log(`Brevo: Email sent to ${email}`);
}
