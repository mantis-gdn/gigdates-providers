const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

exports.handler = async function (event) {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: true }
  });

  const url = new URL(event.rawUrl || `${process.env.BASE_URL}${event.path}${event.queryStringParameters ? '?' + new URLSearchParams(event.queryStringParameters) : ''}`);
  const token = url.searchParams.get('token');

  if (!token) {
    return {
      statusCode: 400,
      body: 'Missing token.'
    };
  }

  // Handle form submission
  if (event.httpMethod === 'POST') {
    const form = new URLSearchParams(event.body);
    const newPassword = form.get('new_password');

    if (!newPassword || newPassword.length < 6) {
      return {
        statusCode: 400,
        body: 'Password must be at least 6 characters.'
      };
    }

    const [[resetRecord]] = await pool.query(
      'SELECT provider_id, expires_at FROM provider_resets WHERE token = ?',
      [token]
    );

    if (!resetRecord || new Date(resetRecord.expires_at) < new Date()) {
      return {
        statusCode: 400,
        body: 'This password reset link is invalid or has expired.'
      };
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await pool.query(
      'UPDATE providers SET login_password = ? WHERE provider_id = ?',
      [hashed, resetRecord.provider_id]
    );

    await pool.query(
      'DELETE FROM provider_resets WHERE token = ?',
      [token]
    );

    return {
      statusCode: 200,
      body: 'Your password has been reset successfully. You may now log in.'
    };
  }

  // Show reset form
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Create New Password</title>
    <style>
      body {
        background: #000;
        color: #fff;
        font-family: 'Segoe UI', sans-serif;
        padding: 2em;
        max-width: 500px;
        margin: auto;
      }
      h1 {
        color: #ffcc00;
      }
      input {
        width: 100%;
        padding: 0.6em;
        margin-top: 0.5em;
        margin-bottom: 1em;
        background: #222;
        color: #fff;
        border: 1px solid #ffb6c1;
        border-radius: 6px;
      }
      button {
        background: #ffcc00;
        color: #000;
        font-weight: bold;
        padding: 0.7em 1.2em;
        border: none;
        border-radius: 6px;
        cursor: pointer;
      }
      button:hover {
        background: #ffaa00;
      }
    </style>
  </head>
  <body>
    <h1>Reset Your Password</h1>
    <form method="POST">
      <label>New Password:</label>
      <input type="password" name="new_password" required minlength="6">
      <button type="submit">Set New Password</button>
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
