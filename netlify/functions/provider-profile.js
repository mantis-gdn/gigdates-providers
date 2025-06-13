// netlify/functions/provider-profile.js
const mysql = require('mysql2/promise');

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

    await pool.query(
      `UPDATE providers SET name = ?, bio = ?, website = ?, facebook = ?, instagram = ?, youtube = ?, logo_url = ?, login_password = ? WHERE provider_id = ?`,
      [name, bio, website, facebook, instagram, youtube, logo_url, login_password, providerId]
    );

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

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Edit Profile - ${provider.name}</title>
    <style>
      body { font-family: sans-serif; background: #000; color: #fff; padding: 1em; }
      h1 { color: #ffcc00; }
      label { display: block; margin-top: 1em; }
      input, textarea { width: 100%; padding: 0.5em; margin-top: 0.2em; }
      button { margin-top: 1em; padding: 0.5em 1em; background: #ffcc00; border: none; color: #000; font-weight: bold; cursor: pointer; }
      button:hover { background: #ffaa00; }
      .menu { margin-bottom: 1em; }
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
      .menu a:hover { background: #555; }
    </style>
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
      <label>Login Password:
        <input type="text" name="login_password" value="${provider.login_password || ''}" required>
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
