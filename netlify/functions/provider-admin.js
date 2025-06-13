// netlify/functions/provider-admin.js
const mysql = require('mysql2/promise');

exports.handler = async function(event) {
  const match = event.path.match(/\/providers\/([^\/]+)\/admin/);
  const providerId = match ? match[1] : null;

  if (!providerId) {
    return { statusCode: 400, body: 'Missing provider ID' };
  }

  const cookies = event.headers.cookie || '';
  const sessionMatch = cookies.match(/provider_id=([^;]+)/);
  const sessionProviderId = sessionMatch ? sessionMatch[1] : null;

  if (sessionProviderId !== providerId) {
    return {
      statusCode: 302,
      headers: {
        Location: `/providers/${providerId}/login`
      },
      body: 'Redirecting to login...'
    };
  }

  const isPost = event.httpMethod === 'POST';

  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: true }
  });

  if (isPost) {
    const form = new URLSearchParams(event.body);
    const leadId = form.get('lead_id');
    const newStatus = form.get('status');

    await pool.query(
      'UPDATE provider_leads SET status = ? WHERE id = ? AND provider_id = ?',
      [newStatus, leadId, providerId]
    );

    return {
      statusCode: 302,
      headers: {
        Location: `/providers/${providerId}/admin`
      },
      body: 'Redirecting...'
    };
  }

  const [providerRows] = await pool.query(
    'SELECT name FROM providers WHERE provider_id = ?',
    [providerId]
  );

  if (!providerRows.length) {
    return {
      statusCode: 404,
      body: 'Provider not found'
    };
  }

  const providerName = providerRows[0].name;

  const [leads] = await pool.query(
    'SELECT * FROM provider_leads WHERE provider_id = ? ORDER BY submitted_at DESC',
    [providerId]
  );

  const html = `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${providerName} Admin</title>
    <style>
      body { font-family: sans-serif; background: #000; color: #fff; padding: 1em; }
      .top-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        margin-bottom: 1em;
      }
      .nav-links {
        display: flex;
        gap: 0.5em;
      }
      .nav-button {
        background: #ffcc00;
        color: #000;
        padding: 0.4em 0.8em;
        text-decoration: none;
        border-radius: 4px;
        font-weight: bold;
      }
      .nav-button:hover {
        background: #e6b800;
      }
      h1 { color: #ffcc00; margin: 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 1em; }
      th, td { border: 1px solid #666; padding: 0.5em; }
      select, button { padding: 0.3em; }
      a { color: #66f; text-decoration: underline; }
    </style>
  </head>
  <body>
    <div class="top-bar">
      <h1>Admin Panel for ${providerName}</h1>
      <div class="nav-links">
        <a class="nav-button" href="/providers/${providerId}/admin/stats">📊 Stats</a>
        <a class="nav-button" href="/providers/${providerId}/logout">Logout</a>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Name</th><th>Email</th><th>Service</th><th>Status</th><th>Change</th>
        </tr>
      </thead>
      <tbody>
        ${leads.map(lead => `
          <tr>
            <td>${lead.client_name}</td>
            <td>${lead.client_email}</td>
            <td><a href="/providers/${providerId}/admin/${lead.id}">${lead.service_requested}</a></td>
            <td>${lead.status || 'new'}</td>
            <td>
              <form method="POST">
                <input type="hidden" name="lead_id" value="${lead.id}" />
                <select name="status">
                  <option value="new"${lead.status === 'new' ? ' selected' : ''}>new</option>
                  <option value="in_review"${lead.status === 'in_review' ? ' selected' : ''}>in_review</option>
                  <option value="quoted"${lead.status === 'quoted' ? ' selected' : ''}>quoted</option>
                  <option value="converted"${lead.status === 'converted' ? ' selected' : ''}>converted</option>
                  <option value="rejected"${lead.status === 'rejected' ? ' selected' : ''}>rejected</option>
                </select>
                <button type="submit">Update</button>
              </form>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </body>
  </html>`;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: html
  };
};
