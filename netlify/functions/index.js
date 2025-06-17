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
    const [providers] = await pool.query('SELECT * FROM providers');
    const [services] = await pool.query('SELECT * FROM provider_services');

    // Group services by provider_id
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
          ${provider.logo_url ? `<img src="${provider.logo_url}" alt="${provider.name} Logo">` : ''}
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
  <title>Gig Dates Network – Providers</title>
  <style>
    body {
      background: #111;
      color: #fff;
      font-family: 'Segoe UI', sans-serif;
      padding: 2em;
      max-width: 1000px;
      margin: auto;
    }
    h1 {
      text-align: center;
      color: #ffcc00;
      margin-bottom: 1em;
    }
    .provider-card {
      background: #222;
      border-radius: 12px;
      padding: 1.2em;
      margin-bottom: 2em;
      box-shadow: 0 0 12px rgba(255, 204, 0, 0.2);
    }
    .provider-card img {
      max-width: 150px;
      height: auto;
      display: block;
      margin-bottom: 1em;
    }
    .provider-card h2 {
      margin-top: 0;
      color: #ffcc00;
    }
    .provider-card ul {
      padding-left: 1.2em;
    }
    .provider-card li {
      margin-bottom: 0.5em;
    }
    a {
      display: inline-block;
      background: #ffcc00;
      color: #000;
      padding: 0.5em 1em;
      text-decoration: none;
      border-radius: 6px;
      margin-top: 0.5em;
    }
    a:hover {
      background: #ffaa00;
    }
  </style>
</head>
<body>
  <h1>Our Featured Providers</h1>
  ${providerCards}
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
