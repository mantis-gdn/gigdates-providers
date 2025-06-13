// netlify/functions/provider-lead.js
const mysql = require('mysql2/promise');
const { Resend } = require('resend');

exports.handler = async function(event) {
  const match = event.path.match(/\/providers\/([^\/]+)\/admin\/([^\/]+)/);
  const providerId = match ? match[1] : null;
  const leadId = match ? match[2] : null;

  if (!providerId || !leadId) {
    return { statusCode: 400, body: 'Missing provider ID or lead ID' };
  }

  const isPost = event.httpMethod === 'POST';
  const submitted = event.queryStringParameters?.submitted === 'true';

  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: true }
  });

  const [[provider]] = await pool.query(
    'SELECT name FROM providers WHERE provider_id = ?',
    [providerId]
  );

  const [[lead]] = await pool.query(
    'SELECT * FROM provider_leads WHERE id = ? AND provider_id = ?',
    [leadId, providerId]
  );

  if (!provider || !lead) {
    return {
      statusCode: 404,
      body: 'Lead or provider not found'
    };
  }

  const formatLabel = (key) => {
    return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const formatValue = (key, value) => {
    if (key.includes('date') || key.includes('time') || key.endsWith('_at')) {
      const dt = new Date(value);
      if (!isNaN(dt)) {
        return dt.toLocaleString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        });
      }
    }
    return value;
  };

  if (isPost) {
    const form = new URLSearchParams(event.body);
    const newStatus = form.get('status');
    const messageText = form.get('message');

    if (newStatus) {
      await pool.query(
        'UPDATE provider_leads SET status = ? WHERE id = ? AND provider_id = ?',
        [newStatus, leadId, providerId]
      );
    }

    if (messageText) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const leadDetails = Object.entries(lead)
        .map(([k, v]) => `${formatLabel(k)}: ${formatValue(k, v)}`)
        .join('<br>');

      await resend.emails.send({
        from: process.env.EMAIL_FROM,
        to: lead.client_email,
        subject: `Message from ${provider.name}`,
        html: `<p>${messageText}</p><hr><h3>Lead Details</h3><p>${leadDetails}</p>`
      });
    }

    return {
      statusCode: 302,
      headers: {
        Location: `/providers/${providerId}/admin/${leadId}?submitted=true`
      },
      body: 'Redirecting...'
    };
  }

  const leadFields = Object.entries(lead).map(([key, value]) => {
    return `<div class="field"><label>${formatLabel(key)}:</label><div class="value">${formatValue(key, value)}</div></div>`;
  }).join('');

  const messageBanner = submitted
    ? `<div style="background:#0a0; color:#fff; padding:0.5em; margin-bottom:1em;">Message sent successfully.</div>`
    : '';

  const html = `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lead Detail - ${provider.name}</title>
    <style>
      body { font-family: sans-serif; background: #000; color: #fff; padding: 1em; }
      h1 { color: #ffcc00; }
      .field { margin-bottom: 1em; }
      label { display: block; font-weight: bold; }
      .value { margin-top: 0.2em; }
      select, button, textarea { padding: 0.3em; width: 100%; }
    </style>
  </head>
  <body>
    ${messageBanner}
    <h1>Lead Detail for ${provider.name}</h1>
    ${leadFields}
    <form method="POST">
      <div class="field">
        <label for="status">Change Status</label>
        <select name="status">
          <option value="new"${lead.status === 'new' ? ' selected' : ''}>new</option>
          <option value="in_review"${lead.status === 'in_review' ? ' selected' : ''}>in_review</option>
          <option value="quoted"${lead.status === 'quoted' ? ' selected' : ''}>quoted</option>
          <option value="converted"${lead.status === 'converted' ? ' selected' : ''}>converted</option>
          <option value="rejected"${lead.status === 'rejected' ? ' selected' : ''}>rejected</option>
        </select>
      </div>
      <button type="submit">Update Status</button>
    </form>
    <hr />
    <h2>Send Message to Client</h2>
    <form method="POST">
      <div class="field">
        <label for="message">Message</label>
        <textarea name="message" rows="5" required></textarea>
      </div>
      <button type="submit">Send Email</button>
    </form>
  </body>
  </html>`;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: html
  };
};
