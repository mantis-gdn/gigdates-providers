const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

exports.handler = async function(event) {
  const match = event.path.match(/\/providers\/([^\/]+)\/admin\/profile/);
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

  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: true }
  });

  const isPost = event.httpMethod === 'POST';

  if (isPost) {
    const form = new URLSearchParams(event.body);
    const name = form.get('name');
    const bio = form.get('bio');
    const website = form.get('website');
    const facebook = form.get('facebook');
    const instagram = form.get('instagram');
    const youtube = form.get('youtube');
    const logo_url = form.get('logo_url');
    const login_password = form.get('login_password');

    const [[currentProvider]] = await pool.query(
      'SELECT login_password FROM providers WHERE provider_id = ?',
      [providerId]
    );

    let hashedPassword = currentProvider.login_password;

    if (login_password && login_password.trim() !== '') {
      const isSame = await bcrypt.compare(login_password, currentProvider.login_password).catch(() => false);
      if (!isSame) {
        const salt = await bcrypt.genSalt(10);
        hashedPassword = await bcrypt.hash(login_password, salt);
      }
    }

    await pool.query(
      `UPDATE providers 
       SET name = ?, bio = ?, website = ?, facebook = ?, instagram = ?, youtube = ?, logo_url = ?, login_password = ?
       WHERE provider_id = ?`,
      [name, bio, website, facebook, instagram, youtube, logo_url, hashedPassword, providerId]
    );

    const serviceIds = form.getAll('service_id');
    const serviceKeys = form.getAll('service_key');
    const serviceNames = form.getAll('service_name');
    const serviceDescriptions = form.getAll('service_description');
    const servicePrices = form.getAll('starting_price');
    const serviceUnits = form.getAll('unit');

    for (let i = 0; i < serviceIds.length; i++) {
      const id = serviceIds[i];
      const serviceKey = serviceKeys[i];
      const serviceName = serviceNames[i];
      const description = serviceDescriptions[i];
      const price = servicePrices[i] || null;
      const unit = serviceUnits[i];

      if (id && id.trim() !== '') {
        await pool.query(
          `UPDATE provider_services
           SET service_id = ?, name = ?, description = ?, starting_price = ?, unit = ?
           WHERE id = ? AND provider_id = ?`,
          [serviceKey, serviceName, description, price, unit, id, providerId]
        );
      } else if (serviceKey && serviceKey.trim() !== '') {
        await pool.query(
          `INSERT INTO provider_services (provider_id, service_id, name, description, starting_price, unit)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [providerId, serviceKey, serviceName, description, price, unit]
        );
      }
    }

    return {
      statusCode: 302,
      headers: {
        Location: `/providers/${providerId}/admin/profile`
      },
      body: 'Redirecting...'
    };
  }

  const [[provider]] = await pool.query(
    'SELECT * FROM providers WHERE provider_id = ?',
    [providerId]
  );

  const [services] = await pool.query(
    'SELECT * FROM provider_services WHERE provider_id = ?',
    [providerId]
  );

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Edit Profile - ${provider.name}</title>
    <style>
      body {
        font-family: sans-serif;
        background: #000;
        color: #fff;
        padding: 1em;
      }
      h1 {
        color: #ffcc00;
      }
      h2 {
        margin-top: 2em;
        color: #ccc;
      }
      label {
        display: block;
        margin-top: 1em;
        color: #ffcc00;
      }
      input, textarea, select {
        width: 100%;
        padding: 0.5em;
        margin-top: 0.2em;
        background: #333;
        color: #ffcc00;
        border: 1px solid #555;
        border-radius: 4px;
      }
      input:focus, textarea:focus, select:focus {
        outline: none;
        border-color: #ffcc00;
        box-shadow: 0 0 5px #ffcc00;
      }
      textarea {
        resize: vertical;
      }
      button {
        margin-top: 1em;
        padding: 0.5em 1em;
        background: #ffcc00;
        border: none;
        color: #000;
        font-weight: bold;
        cursor: pointer;
      }
      button:hover {
        background: #ffaa00;
      }
      .menu {
        margin-bottom: 1em;
      }
      .menu a {
        display: inline-block;
        margin-right: 0.5em;
        padding: 0.5em 1em;
        background: #333;
        color: #fff;
        text-decoration: none;
        border-radius: 4px;
        font-weight: bold;
      }
      .menu a:hover {
        background: #555;
      }
      .service-row {
        display: flex;
        flex-wrap: wrap;
        gap: 1em;
        background: #111;
        padding: 1em;
        border-radius: 6px;
        margin-bottom: 1em;
      }
      .service-row > div {
        flex: 1;
        min-width: 200px;
      }
      hr {
        border: 0;
        height: 1px;
        background: #444;
        margin: 2em 0;
      }
    </style>
    <script>
      function addServiceRow() {
        const container = document.getElementById('service-list');
        const template = document.getElementById('service-template');
        const clone = template.content.cloneNode(true);
        container.appendChild(clone);
      }
    </script>
  </head>
  <body>
    <div class="menu">
      <a href="/providers/${providerId}/admin">Dashboard</a>
      <a href="/providers/${providerId}/admin/stats">Stats</a>
      <a href="/providers/${providerId}/admin/profile">Profile</a>
      <a href="/providers/${providerId}/logout">Logout</a>
    </div>
    <h1>Edit Profile for ${provider.name}</h1>
    <form method="POST">
      <label>Name:
        <input type="text" name="name" value="${provider.name}" required>
      </label>
      <label>Bio:
        <textarea name="bio" rows="4">${provider.bio || ''}</textarea>
      </label>
      <label>Website:
        <input type="url" name="website" value="${provider.website || ''}">
      </label>
      <label>Facebook:
        <input type="url" name="facebook" value="${provider.facebook || ''}">
      </label>
      <label>Instagram:
        <input type="url" name="instagram" value="${provider.instagram || ''}">
      </label>
      <label>YouTube:
        <input type="url" name="youtube" value="${provider.youtube || ''}">
      </label>
      <label>Logo URL:
        <input type="text" name="logo_url" value="${provider.logo_url || ''}">
      </label>

      <h2>Services</h2>
      <div id="service-list">
        ${services.map(service => `
          <div class="service-row">
            <input type="hidden" name="service_id" value="${service.id}">
            <div>
              <label>Service ID:
                <input type="text" name="service_key" value="${service.service_id || ''}" required>
              </label>
            </div>
            <div>
              <label>Service Name:
                <input type="text" name="service_name" value="${service.name || ''}" required>
              </label>
            </div>
            <div>
              <label>Description:
                <textarea name="service_description" rows="2">${service.description || ''}</textarea>
              </label>
            </div>
            <div>
              <label>Starting Price:
                <input type="number" step="0.01" name="starting_price" value="${service.starting_price || ''}">
              </label>
            </div>
            <div>
              <label>Unit:
                <input type="text" name="unit" value="${service.unit || ''}">
              </label>
            </div>
          </div>
        `).join('')}
      </div>

      <template id="service-template">
        <div class="service-row">
          <input type="hidden" name="service_id" value="">
          <div>
            <label>Service ID:
              <input type="text" name="service_key" required>
            </label>
          </div>
          <div>
            <label>Service Name:
              <input type="text" name="service_name" required>
            </label>
          </div>
          <div>
            <label>Description:
              <textarea name="service_description" rows="2"></textarea>
            </label>
          </div>
          <div>
            <label>Starting Price:
              <input type="number" step="0.01" name="starting_price">
            </label>
          </div>
          <div>
            <label>Unit:
              <input type="text" name="unit">
            </label>
          </div>
        </div>
      </template>

      <button type="button" onclick="addServiceRow()">+ Add New Service</button>

      <label>New Login Password:
        <input type="password" name="login_password" placeholder="Enter new password">
      </label>
      <button type="submit">Save Changes</button>
    </form>
  </body>
  </html>
  `;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: html
  };
};
