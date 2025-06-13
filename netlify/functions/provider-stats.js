// netlify/functions/provider-stats.js
const mysql = require('mysql2/promise');

exports.handler = async function(event) {
  const match = event.path.match(/\/providers\/([^\/]+)\/admin\/stats/);
  const providerId = match ? match[1] : null;

  if (!providerId) {
    return { statusCode: 400, body: 'Missing provider ID' };
  }

  // Session check
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

  if (!provider) {
    return {
      statusCode: 404,
      body: 'Provider not found'
    };
  }

  const [[totalLeads]] = await pool.query(
    'SELECT COUNT(*) as total FROM provider_leads WHERE provider_id = ?',
    [providerId]
  );

  const [statusCounts] = await pool.query(
    'SELECT status, COUNT(*) as count FROM provider_leads WHERE provider_id = ? GROUP BY status',
    [providerId]
  );

  const [dailyCounts] = await pool.query(
    `SELECT DATE(submitted_at) as date, COUNT(*) as count
     FROM provider_leads
     WHERE provider_id = ?
     GROUP BY DATE(submitted_at)
     ORDER BY date DESC
     LIMIT 7`,
    [providerId]
  );

  const html = `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${provider.name} Stats</title>
    <style>
      body { font-family: sans-serif; background: #000; color: #fff; padding: 1em; }
      h1, h2 { color: #ffcc00; }
      ul { padding-left: 1.2em; }
      li { margin-bottom: 0.4em; }
    </style>
  </head>
  <body>
    <h1>Lead Stats for ${provider.name}</h1>
    <p><strong>Total Leads:</strong> ${totalLeads.total}</p>

    <h2>Leads by Status</h2>
    <ul>
      ${statusCounts.map(row => `<li>${row.status || 'unspecified'}: ${row.count}</li>`).join('')}
    </ul>

    <h2>Leads in Last 7 Days</h2>
    <ul>
      ${dailyCounts.map(row => `<li>${new Date(row.date).toLocaleDateString()}: ${row.count}</li>`).join('')}
    </ul>
  </body>
  </html>`;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: html
  };
};
