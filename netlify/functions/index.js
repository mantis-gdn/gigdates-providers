const mysql = require('mysql2/promise');

exports.handler = async function () {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: true }
  });

  try {
    const [providers] = await pool.query(
      "SELECT * FROM providers WHERE status = 'active' ORDER BY date_added DESC"
    );
    const [services] = await pool.query('SELECT * FROM provider_services');

    const servicesByProvider = {};
    services.forEach(service => {
      if (!servicesByProvider[service.provider_id]) {
        servicesByProvider[service.provider_id] = [];
      }
      servicesByProvider[service.provider_id].push(service);
    });

    const providerCards = providers.map(provider => {
      const providerServices = servicesByProvider[provider.provider_id] || [];
      const servicePreview = providerServices.slice(0, 3).map(s =>
        `<li>${s.name} <em>from $${s.starting_price}</em></li>`
      ).join('');

      return `
        <div class="provider-card">
          ${provider.logo_url ? `<img class="provider-logo" src="${provider.logo_url}" alt="${provider.name} Logo">` : ''}
          <h2>${provider.name}</h2>
          <p>${provider.bio || ''}</p>
          <ul>${servicePreview}</ul>
          <a href="/providers/${provider.provider_id}">View Profile</a>
        </div>
      `;
    }).join('');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Gig Dates Provider Network</title>
  <style>
    body {
      background: #000;
      color: #fff;
      font-family: 'Segoe UI', sans-serif;
      margin: 0;
      padding: 0;
    }

    header {
      text-align: center;
      padding: 2em 1em;
      background: #000;
    }

    header img {
      max-width: 300px;
      height: auto;
      margin-bottom: 1em;
    }

    header h1 {
      margin: 0;
      font-size: 2em;
      color: #fff;
    }

    main {
      padding: 2em 1em;
      max-width: 1000px;
      margin: auto;
    }

    .provider-card {
      background: #1a1a1a;
      border-radius: 12px;
      padding: 1.5em;
      margin-bottom: 2em;
      box-shadow: 0 0 20px rgba(0, 170, 255, 0.2);
      transition: transform 0.2s ease;
    }

    .provider-card:hover {
      transform: scale(1.02);
    }

    .provider-logo {
      max-width: 150px;
      height: auto;
      margin-bottom: 1em;
      display: block;
    }

    .provider-card h2 {
      margin: 0.5em 0;
      color: #00aaff;
    }

    .provider-card p {
      font-size: 0.95em;
      color: #ccc;
    }

    .provider-card ul {
      margin: 1em 0;
      padding-left: 1.2em;
      list-style: disc;
    }

    .provider-card li {
      margin-bottom: 0.5em;
    }

    .provider-card a {
      display: inline-block;
      background: #00aaff;
      color: #000;
      padding: 0.5em 1.2em;
      text-decoration: none;
      font-weight: bold;
      border-radius: 6px;
    }

    .provider-card a:hover {
      background: #0088cc;
    }

    @media (max-width: 600px) {
      header img {
        max-width: 300px;
      }

      .provider-card {
        padding: 1em;
      }
    }
  </style>
</head>
<body>
  <header>
    <img src="/media/logo.png" alt="Gig Dates Provider Network Logo">
    <h1>Our Featured Providers</h1>
  </header>
  <main>
    ${providerCards || '<p>No active providers found at this time.</p>'}
  </main>
</body>
</html>
`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: html
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: `Error: ${err.message}`
    };
  }
};
