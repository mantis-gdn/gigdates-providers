// netlify/functions/provider-stats.js
const mysql = require('mysql2/promise');

exports.handler = async function(event) {
  const match = event.path.match(/\/providers\/([^\/]+)\/admin\/stats/);
  const providerId = match ? match[1] : null;

  if (!providerId) {
    return { statusCode: 400, body: 'Missing provider ID' };
  }

  // 🔐 Session check
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

  const [rows] = await pool.query(
    'SELECT service_requested, COUNT(*) AS count FROM provider_leads WHERE provider_id = ? GROUP BY service_requested',
    [providerId]
  );

  const labels = rows.map(row => row.service_requested);
  const data = rows.map(row => row.count);

  const html = `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${provider.name} - Stats</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
      body { font-family: sans-serif; background: #000; color: #fff; padding: 1em; }
      h1 { color: #ffcc00; margin-bottom: 0.5em; }
      .top-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .logout-link {
        color: #fff;
        background: #f00;
        padding: 0.5em 1em;
        text-decoration: none;
        border-radius: 4px;
        font-weight: bold;
      }
      .logout-link:hover {
        background: #c00;
      }
      canvas { max-width: 100%; background: #111; padding: 1em; border-radius: 8px; }
    </style>
  </head>
  <body>
    <div class="top-bar">
      <h1>Stats for ${provider.name}</h1>
      <a class="logout-link" href="/providers/${providerId}/logout">Logout</a>
    </div>
    <canvas id="leadsChart" width="400" height="300"></canvas>
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
          scales: {
            y: {
              beginAtZero: true,
              ticks: { color: '#fff' }
            },
            x: {
              ticks: { color: '#fff' }
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
