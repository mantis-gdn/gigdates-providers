// netlify/functions/provider-stats.js
const mysql = require('mysql2/promise');
const cookie = require('cookie');

exports.handler = async function(event) {
  const match = event.path.match(/\/providers\/([^\/]+)\/admin\/stats/);
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

  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: true }
  });

  const [providerRows] = await pool.query(
    'SELECT name FROM providers WHERE provider_id = ?',
    [providerId]
  );

  if (!providerRows.length) {
    return { statusCode: 404, body: 'Provider not found' };
  }

  const providerName = providerRows[0].name;
  const [leads] = await pool.query(
    'SELECT service_requested, COUNT(*) as count FROM provider_leads WHERE provider_id = ? GROUP BY service_requested',
    [providerId]
  );

  const labels = leads.map(row => row.service_requested);
  const data = leads.map(row => row.count);

  const html = `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${providerName} Stats</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
      body { font-family: sans-serif; background: #000; color: #fff; padding: 1em; }
      h1 { color: #ffcc00; }
      canvas { background: #fff; border-radius: 8px; margin-top: 2em; }
      .nav-buttons {
        display: flex;
        gap: 0.5em;
        margin-bottom: 1em;
        flex-wrap: wrap;
      }
      .nav-buttons a {
        background: #222;
        color: #fff;
        padding: 0.6em 1em;
        text-decoration: none;
        border-radius: 4px;
        font-weight: bold;
        transition: background 0.2s;
        flex: 1 1 auto;
        text-align: center;
      }
      .nav-buttons a:hover {
        background: #444;
      }
    </style>
  </head>
  <body>
    <h1>${providerName} - Stats</h1>
    <div class="nav-buttons">
      <a href="/providers/${providerId}/admin">Dashboard</a>
      <a href="/providers/${providerId}/admin/stats">Stats</a>
      <a href="/providers/${providerId}/admin/profile">Profile</a>
      <a href="/providers/${providerId}/logout">Logout</a>
    </div>
    <canvas id="leadsChart" width="400" height="200"></canvas>
    <script>
      const ctx = document.getElementById('leadsChart').getContext('2d');
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ${JSON.stringify(labels)},
          datasets: [{
            label: 'Leads by Service',
            data: ${JSON.stringify(data)},
            backgroundColor: 'rgba(255, 204, 0, 0.6)',
            borderColor: 'rgba(255, 204, 0, 1)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          scales: {
            y: {
              beginAtZero: true,
              ticks: { color: '#fff' },
              grid: { color: '#444' }
            },
            x: {
              ticks: { color: '#fff' },
              grid: { color: '#444' }
            }
          },
          plugins: {
            legend: { labels: { color: '#fff' } }
          }
        }
      });
    </script>
  </body>
  </html>`;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: html
  };
};
