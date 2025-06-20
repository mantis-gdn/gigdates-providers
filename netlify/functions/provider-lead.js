// netlify/functions/provider-lead.js
const mysql = require('mysql2/promise');
const { Resend } = require('resend');
const cookie = require('cookie');

exports.handler = async function (event) {
  const match = event.path.match(/\/providers\/([^\/]+)\/admin\/([^\/]+)/);
  const providerId = match ? match[1] : null;
  const leadId = match ? match[2] : null;

  if (!providerId || !leadId) {
    return { statusCode: 400, body: 'Missing provider ID or lead ID' };
  }

  const cookies = cookie.parse(event.headers.cookie || '');
  const sessionProviderId = cookies.provider_id || null;
  const isAdmin = cookies.admin_auth === process.env.ADMIN_PASSWORD;

  if (sessionProviderId !== providerId && !isAdmin) {
    return {
      statusCode: 302,
      headers: {
        Location: `/providers/${providerId}/login`
      },
      body: 'Redirecting to login...'
    };
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
    'SELECT name, contact_email FROM providers WHERE provider_id = ?',
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
        .map(([k, v]) => `${formatLabel(k)}: ${v}`)
        .join('<br>');

      await resend.emails.send({
        from: process.env.EMAIL_FROM,
        to: lead.client_email,
        subject: `Message from ${provider.name}`,
        replyTo: provider.contact_email,
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
    return `<div class="field"><label>${formatLabel(key)}:</label><div class="value">${value}</div></div>`;
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
      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background: #000;
        color: #fff;
        margin: 0;
        padding: 1em;
        max-width: 800px;
        margin-left: auto;
        margin-right: auto;
      }
      h1 {
        color: #ffcc00;
        font-size: 1.8em;
        margin-bottom: 0.5em;
        text-align: center;
      }
      nav {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5em;
        justify-content: center;
        margin-bottom: 1.5em;
      }
      nav a {
        padding: 0.6em 1em;
        border-radius: 6px;
        font-weight: bold;
        color: #fff;
        text-decoration: none;
        flex: 1 1 auto;
        text-align: center;
      }
      .blue { background-color: #007bff; }
      .purple { background-color: #6f42c1; }
      .teal { background-color: #20c997; }
      .red { background-color: #dc3545; }
      nav a:hover { opacity: 0.85; }
      .field {
        margin-bottom: 1.2em;
      }
      label {
        display: block;
        font-weight: bold;
        margin-bottom: 0.3em;
        font-size: 1em;
      }
      .value {
        padding: 0.5em;
        background: #111;
        border-radius: 4px;
        word-wrap: break-word;
        font-size: 0.95em;
      }
      select,
      button,
      textarea {
        padding: 0.5em;
        width: 100%;
        font-size: 1em;
        border: none;
        border-radius: 4px;
        box-sizing: border-box;
        background: #222;
        color: #fff;
      }
      button {
        background-color: #ffcc00;
        color: #000;
        font-weight: bold;
        cursor: pointer;
        margin-top: 0.5em;
      }
      button:hover {
        opacity: 0.9;
      }
      hr {
        margin: 2em 0;
        border: 0;
        border-top: 1px solid #333;
      }
      @media (max-width: 600px) {
        h1 {
          font-size: 1.4em;
        }
        nav {
          flex-direction: column;
          gap: 0.75em;
        }
        nav a {
          font-size: 0.95em;
        }
        textarea {
          font-size: 0.9em;
        }
        .value {
          font-size: 0.9em;
        }
      }
    </style>
  </head>
  <body>
    ${messageBanner}
    <h1>Lead Detail for ${provider.name}</h1>
    <nav>
      <a class="blue" href="/providers/${providerId}/admin">Dashboard</a>
      <a class="purple" href="/providers/${providerId}/admin/stats">Stats</a>
      <a class="teal" href="/providers/${providerId}/admin/profile">Profile</a>
      <a class="red" href="/providers/${providerId}/logout">Logout</a>
    </nav>
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
