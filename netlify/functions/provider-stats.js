// netlify/functions/provider-stats.js
const mysql = require('mysql2/promise');

exports.handler = async function(event) {
  const match = event.path.match(/\/providers\/([^\/]+)\/admin\/stats/);
  const providerId = match ? match[1] : null;

  if (!providerId) {
    return {
      statusCode: 400,
      body: 'Missing provider ID'
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
      body: 'Lead or provider not found'
    };
  }

  const [[{ total }]] = await pool.query(
    'SELECT COUNT(*) AS total FROM provider_leads WHERE provider_id = ?',
    [providerId]
  );

  const [statusBreakdown] = await pool.query(
    `SELECT status, COUNT(*) AS count
     FROM provider_leads
     WHERE provider_id = ?
     GROUP BY status`,
    [providerId]
  );

  const [weeklyLeads] = await pool.query(
    `SELECT DATE(submitted_at) AS date, COUNT(*) AS count
     FROM provider_leads
     WHERE provider_id = ? AND submitted_at >= NOW() - INTERVAL 7 DAY
     GROUP BY DATE(submitted_at)
     ORDER BY date DESC`,
    [providerId]
  );

  const [topServices] = await pool.query(
    `SELECT service_requested, COUNT(*) AS count
     FROM provider_leads
     WHERE provider_id = ?
     GROUP BY service_requested
     ORDER BY count DESC
     LIMIT 5`,
    [providerId]
  );

  const html = `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stats - ${provider.name}</title>
    <style>
      body { font-family: sans-serif; background: #000; color: #fff; padding: 1em; }
      h1 { color: #ffcc00; }
      section { margin-bottom: 2em; }
      table { width: 100%; border-collapse: collapse; margin-top: 0.5em; }
      th, td { border: 1px solid #666; padding: 0.5em; }
      th { background: #222; }
    </style>
  </head>
  <body>
    <h1>Analytics for ${provider.name}</h1>

    <section>
      <h2>Total Leads</h2>
      <p>${total}</p>
    </section>

    <section>
      <h2>Status Breakdown</h2>
      <table>
        <tr><th>Status</th><th>Count</th></tr>
        ${statusBreakdown.map(row => `<tr><td>${row.status}</td><td>${row.count}</td></tr>`).join('')}
      </table>
    </section>

    <section>
      <h2>Leads This Week</h2>
      <table>
        <tr><th>Date</th><th>Count</th></tr>
        ${weeklyLeads.map(row => `<tr><td>${row.date.toISOString().split('T')[0]}</td><td>${row.count}</td></tr>`).join('')}
      </table>
    </section>

    <section>
      <h2>Top Services</h2>
      <table>
        <tr><th>Service</th><th>Count</th></tr>
        ${topServices.map(row => `<tr><td>${row.service_requested}</td><td>${row.count}</td></tr>`).join('')}
      </table>
    </section>

  </body>
  </html>`;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: html
  };
};
