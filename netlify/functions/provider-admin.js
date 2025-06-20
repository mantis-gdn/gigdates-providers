// netlify/functions/provider-admin.js
const mysql = require('mysql2/promise');
const cookie = require('cookie');

exports.handler = async function(event) {
  const match = event.path.match(/\/providers\/([^\/]+)\/admin/);
  const providerId = match ? match[1] : null;

  if (!providerId) {
    return { statusCode: 400, body: 'Missing provider ID' };
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

    if (form.get('delete') === 'true') {
      await pool.query('DELETE FROM provider_leads WHERE id = ? AND provider_id = ?', [
        leadId,
        providerId
      ]);
    } else {
      await pool.query(
        'UPDATE provider_leads SET status = ? WHERE id = ? AND provider_id = ?',
        [newStatus, leadId, providerId]
      );
    }

    return {
      statusCode: 302,
      headers: {
        Location: `/providers/${providerId}/admin`
      },
      body: 'Redirecting...'
    };
  }

  const [providerRows] = await pool.query(
    'SELECT name, lead_credits FROM providers WHERE provider_id = ?',
    [providerId]
  );

  if (!providerRows.length) {
    return {
      statusCode: 404,
      body: 'Provider not found'
    };
  }

  const providerName = providerRows[0].name;
  const leadCredits = providerRows[0].lead_credits;

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
      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background: #000;
        color: #fff;
        margin: 0;
        padding: 1em;
      }
      h1 {
        color: #ffcc00;
        text-align: center;
        font-size: 1.75em;
        margin-bottom: 0.25em;
      }
      p.lead-credits {
        text-align: center;
        font-size: 1.1em;
        margin-bottom: 1.5em;
      }
      nav {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5em;
        justify-content: center;
        margin-bottom: 1.5em;
      }
      .nav-btn {
        padding: 0.6em 1em;
        border-radius: 6px;
        font-weight: bold;
        color: #fff;
        text-decoration: none;
        text-align: center;
        flex: 1 1 auto;
      }
      .blue { background-color: #007bff; }
      .purple { background-color: #6f42c1; }
      .teal { background-color: #20c997; }
      .red { background-color: #dc3545; }
      .nav-btn:hover { opacity: 0.9; }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 1em;
      }
      th, td {
        border: 1px solid #444;
        padding: 0.75em 0.5em;
        text-align: left;
        font-size: 0.95em;
      }
      select, button {
        padding: 0.4em;
        font-size: 1em;
        width: 100%;
        box-sizing: border-box;
        background: #222;
        color: #fff;
      }
      form { margin: 0; }
      a { color: #1e90ff; text-decoration: underline; }
      @media (max-width: 768px) {
        table, thead, tbody, th, td, tr { display: block; }
        thead { display: none; }
        tr {
          background: #111;
          border: 1px solid #333;
          border-radius: 6px;
          margin-bottom: 1em;
          padding: 0.75em;
        }
        td { padding: 0.4em 0; }
        td::before {
          content: attr(data-label);
          font-weight: bold;
          display: block;
          color: #ffcc00;
        }
        select, button { margin-top: 0.5em; }
      }
    </style>
    <script>
      function confirmDelete(form) {
        if (confirm('Are you sure you want to delete this lead?')) {
          form.querySelector('input[name="delete"]').value = 'true';
          form.submit();
        }
      }
    </script>
  </head>
  <body>
    <h1>Admin Panel for ${providerName}</h1>
    <p class="lead-credits">
      <strong>Remaining Lead Credits:</strong> ${leadCredits} lead${leadCredits === 1 ? '' : 's'}<br>
      <span style="font-size: 0.9em;">
        Need more? <a href="mailto:info@gigdates.net" style="color:#1e90ff;">Email us to request a refill</a>.
      </span>
    </p>
    <nav>
      <a class="nav-btn blue" href="/providers/${providerId}/admin">Dashboard</a>
      <a class="nav-btn purple" href="/providers/${providerId}/admin/stats">Stats</a>
      <a class="nav-btn teal" href="/providers/${providerId}/admin/profile">Profile</a>
      <a class="nav-btn red" href="/providers/${providerId}/logout">Logout</a>
    </nav>
    <table>
      <thead>
        <tr>
          <th>Name</th><th>Email</th><th>Service</th><th>Status</th><th>Change</th><th>Delete</th>
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
            <td>
              <form method="POST" onsubmit="event.preventDefault(); confirmDelete(this);">
                <input type="hidden" name="lead_id" value="${lead.id}" />
                <input type="hidden" name="delete" value="false" />
                <button type="submit" style="background:#dc3545; color:#fff;">Delete</button>
              </form>
            </td>
          </tr>`).join('')}
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
