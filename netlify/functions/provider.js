// netlify/functions/provider.js
const mysql = require('mysql2/promise');
const querystring = require('querystring');
const { Resend } = require('resend');

// Sanitize CSS to prevent malicious injections
const sanitizeCSS = (css) =>
  (css || '')
    .replace(/<\/?script[^>]*>/gi, '')
    .replace(/url\(['"]?javascript:[^'"]*['"]?\)/gi, '');

exports.handler = async function (event) {
  const isPost = event.httpMethod === 'POST';
  const match = event.path.match(/\/providers\/([^\/\?]+)/);
  const providerId = match ? match[1] : null;

  if (!providerId) {
    return {
      statusCode: 400,
      body: 'Missing or invalid provider ID in URL.',
    };
  }

  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: true },
  });

  if (isPost) {
    const form = querystring.parse(event.body);

    // SPAM protection: honeypot field
    if (form.botcheck && form.botcheck.trim() !== '') {
      return {
        statusCode: 400,
        body: 'Spam detected. Submission rejected.',
      };
    }

    try {
      // Check if provider has credits
      const [[creditRow]] = await pool.query(
        'SELECT lead_credits, name, contact_email FROM providers WHERE provider_id = ? LIMIT 1',
        [form.provider_id]
      );

      if (!creditRow) {
        return { statusCode: 404, body: 'Provider not found.' };
      }

      if (creditRow.lead_credits <= 0) {
        return {
          statusCode: 403,
          body: 'This provider is not accepting new leads at the moment.',
        };
      }

      const provider = creditRow;

      // Insert new lead
      await pool.query(
        `INSERT INTO provider_leads (
          provider_id, client_name, client_email, client_phone,
          service_requested, preferred_timeframe, budget, message,
          referral_source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          form.provider_id,
          form.client_name,
          form.client_email,
          form.client_phone || '',
          form.service_requested,
          form.preferred_timeframe || '',
          form.budget || '',
          form.message || '',
          form.referral_source || '',
        ]
      );

      // Decrement lead credit
      await pool.query(
        'UPDATE providers SET lead_credits = lead_credits - 1 WHERE provider_id = ?',
        [form.provider_id]
      );

      const resend = new Resend(process.env.RESEND_API_KEY);

      const adminText = `
New lead for ${provider.name}!

Name: ${form.client_name}
Email: ${form.client_email}
Phone: ${form.client_phone}
Service: ${form.service_requested}
Timeframe: ${form.preferred_timeframe}
Budget: ${form.budget}

Message:
${form.message}

Referral Source: ${form.referral_source}`.trim();

      await resend.emails.send({
        from: process.env.EMAIL_FROM,
        to: provider.contact_email || process.env.EMAIL_TO,
        bcc: process.env.EMAIL_BCC,
        subject: `New Lead for ${provider.name}`,
        replyTo: form.client_email,
        text: adminText,
      });

      const confirmationText = `
Hi ${form.client_name},

Thanks for reaching out to ${provider.name} through Gig Dates Network!

We received your request for: ${form.service_requested}

We'll be in touch soon to discuss your needs and schedule the next steps.

If you have any urgent questions, feel free to reply to this email.

- The Gig Dates Team`.trim();

      await resend.emails.send({
        from: process.env.EMAIL_FROM,
        to: form.client_email,
        subject: `Thanks for contacting ${provider.name}`,
        replyTo: provider.contact_email,
        text: confirmationText,
      });

      const queryParams = new URLSearchParams({
        submitted: 'true',
        name: form.client_name,
        email: form.client_email,
        service: form.service_requested,
      }).toString();

      return {
        statusCode: 302,
        headers: {
          Location: `/providers/${form.provider_id}?${queryParams}`,
        },
        body: 'Redirecting...',
      };
    } catch (err) {
      return {
        statusCode: 500,
        body: `Database or email error: ${err.message}`,
      };
    }
  }

  // GET request logic
  const qs = event.queryStringParameters || {};
  const isThankYou = qs.submitted === 'true';

  const thankYouHtml = isThankYou
    ? `
    <div class="thank-you">
      <h2>Thank you, ${qs.name}!</h2>
      <p>We’ve received your request for <strong>${qs.service}</strong>.</p>
      <p>A confirmation has been sent to <strong>${qs.email}</strong>.</p>
    </div>
  `
    : '';

  try {
    const [providerRows] = await pool.query(
      'SELECT * FROM providers WHERE provider_id = ? LIMIT 1',
      [providerId]
    );
    const [serviceRows] = await pool.query(
      'SELECT * FROM provider_services WHERE provider_id = ?',
      [providerId]
    );

    if (!providerRows.length) {
      return { statusCode: 404, body: 'Provider not found' };
    }

    const provider = providerRows[0];
    const safeCSS = sanitizeCSS(provider.style_css);
    const hasCredits = provider.lead_credits > 0;

    const servicesHtml = serviceRows
      .map(
        (service) => `
      <li>
        <strong>${service.name}</strong> — ${service.description}<br>
        <em>$${service.starting_price} ${service.unit}</em>
      </li>
    `
      )
      .join('');

    const serviceOptions = serviceRows
      .map(
        (service) =>
          `<option value="${service.name}">${service.name}</option>`
      )
      .join('');

    const formHtml = hasCredits
      ? `
      <h2>Submit an Inquiry</h2>
      <form action="/providers/${providerId}" method="POST">
        <input type="hidden" name="provider_id" value="${providerId}" />

        <label>Your Name:
          <input type="text" name="client_name" required>
        </label>

        <label>Your Email:
          <input type="email" name="client_email" required>
        </label>

        <label>Your Phone:
          <input type="tel" name="client_phone">
        </label>

        <label>Service Needed:
          <select name="service_requested" required>
            <option value="" disabled selected>Select a service</option>
            ${serviceOptions}
          </select>
        </label>

        <label>Preferred Timeframe:
          <input type="text" name="preferred_timeframe">
        </label>

        <label>Budget:
          <input type="text" name="budget">
        </label>

        <label>Message:
          <textarea name="message" rows="4"></textarea>
        </label>

        <label>How did you hear about us?
          <input type="text" name="referral_source">
        </label>

        <!-- Honeypot field -->
        <div style="display:none;">
          <label>Leave this field empty:
            <input type="text" name="botcheck">
          </label>
        </div>

        <button type="submit">Submit Inquiry</button>
      </form>
    `
      : `<p style="color: orange;"><strong>This provider is currently not accepting inquiries.</strong></p>`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${provider.name}</title>
  <style>
    body {
      background-color: #000;
      color: #fff;
      font-family: 'Segoe UI', sans-serif;
      padding: 1em;
      margin: 0 auto;
      max-width: 900px;
      line-height: 1.6;
    }
    a { color: #1e90ff; text-decoration: none; }
    h1, h2 { color: #ffcc00; margin-top: 1.5em; }
    ul { padding-left: 1.2em; }
    li { margin-bottom: 1em; }
    form {
      background-color: #111;
      padding: 1em;
      border-radius: 8px;
      margin-top: 1em;
    }
    input, select, textarea, button {
      width: 100%;
      padding: 0.5em;
      margin-top: 0.3em;
      margin-bottom: 1em;
      border: none;
      border-radius: 4px;
      font-size: 1em;
      box-sizing: border-box;
    }
    input, select, textarea {
      background-color: #222;
      color: #fff;
    }
    button {
      background-color: #ffcc00;
      color: #000;
      font-weight: bold;
      cursor: pointer;
    }
    button:hover { background-color: #ffaa00; }
    .thank-you {
      border: 1px solid #0f0;
      background: #003300;
      padding: 1em;
      border-radius: 6px;
      margin-bottom: 1.5em;
    }
    .logo {
      max-width: 200px;
      height: auto;
      margin-bottom: 1em;
    }
    .footer-logo {
      display: block;
      margin: 3em auto 1em;
      text-align: center;
      max-width: 160px;
      opacity: 0.8;
    }
    @media (max-width: 768px) {
      body { font-size: 1em; padding: 1em; }
      h1 { font-size: 1.6em; }
      h2 { font-size: 1.3em; }
    }
    @media (max-width: 480px) {
      body { font-size: 0.95em; padding: 0.8em; }
      h1 { font-size: 1.4em; }
      h2 { font-size: 1.1em; }
    }
    ${safeCSS}
  </style>
</head>
<body>
  <div id="provider-theme">
    ${provider.logo_url ? `<img src="${provider.logo_url}" alt="${provider.name} logo" class="logo">` : ''}
    <h1>${provider.name}</h1>
    ${thankYouHtml}
    <p>${provider.bio}</p>
    <h2>Services Offered</h2>
    <ul>${servicesHtml}</ul>
    ${formHtml}
  </div>
  <a href="/providers">
    <img src="/media/logo.png" alt="Gig Dates Provider Network Logo" class="footer-logo">
  </a>
</body>
</html>
    `;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: html,
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: `Database error on fetch: ${err.message}`,
    };
  }
};
