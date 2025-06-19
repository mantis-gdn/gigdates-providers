// netlify/functions/provider-new.js
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const cloudinary = require('cloudinary').v2;
const busboy = require('busboy');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

exports.handler = async function (event) {
  const cookies = event.headers.cookie || '';
  const sessionMatch = cookies.match(/admin_auth=([^;]+)/);
  const sessionPassword = sessionMatch ? decodeURIComponent(sessionMatch[1]) : null;

  if (sessionPassword !== process.env.ADMIN_PASSWORD) {
    return {
      statusCode: 302,
      headers: {
        Location: '/admin/login'
      },
      body: 'Redirecting to login...'
    };
  }

  if (
    event.httpMethod === 'POST' &&
    event.headers['content-type'] &&
    event.headers['content-type'].includes('multipart/form-data')
  ) {
    return new Promise((resolve, reject) => {
      const bb = busboy({ headers: event.headers });
      const fields = {};
      let logoUploadPromise = Promise.resolve(null);

      bb.on('field', (name, val) => {
        fields[name] = val;
      });

      bb.on('file', (name, file, info) => {
        if (name === 'logo') {
          if (info && info.filename) {
            logoUploadPromise = new Promise((res, rej) => {
              const uploadStream = cloudinary.uploader.upload_stream(
                { folder: 'gigdates/providers' },
                (err, result) => {
                  if (err) return rej(err);
                  res(result.secure_url);
                }
              );
              file.pipe(uploadStream);
            });
          } else {
            logoUploadPromise = Promise.resolve(null);
            file.resume();
          }
        }
      });

      bb.on('finish', async () => {
        try {
          const logoUrl = await logoUploadPromise;
          const finalLogoUrl = logoUrl || '';

          const salt = await bcrypt.genSalt(10);
          const hashedPassword = await bcrypt.hash(fields.login_password || '', salt);

          const pool = await mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT,
            ssl: { rejectUnauthorized: true },
          });

          await pool.query(
            `INSERT INTO providers (provider_id, name, bio, website, facebook, instagram, youtube, logo_url, login_password)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              fields.provider_id,
              fields.name || '',
              fields.bio || '',
              fields.website || '',
              fields.facebook || '',
              fields.instagram || '',
              fields.youtube || '',
              finalLogoUrl,
              hashedPassword,
            ]
          );

          resolve({
            statusCode: 302,
            headers: {
              Location: `/providers/${fields.provider_id}/admin/profile`,
            },
            body: 'Redirecting...'
          });
        } catch (err) {
          if (err.errno === 1062 && err.sqlMessage.includes('provider_id')) {
            resolve({
              statusCode: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
              body: `<!DOCTYPE html>
              <html><head><meta charset="UTF-8"><title>Duplicate ID</title>
              <style>
                body { font-family: sans-serif; background: #000; color: #fff; text-align: center; padding: 2em; }
                a { color: #ffcc00; text-decoration: none; font-weight: bold; }
                .error-box { background: #111; padding: 2em; border: 1px solid #ff0000; border-radius: 8px; display: inline-block; }
              </style>
              </head><body>
                <div class="error-box">
                  <h1>⚠️ Provider ID Already Exists</h1>
                  <p>The Provider ID <strong>${fields.provider_id}</strong> is already in use.</p>
                  <p><a href="/providers/new">Click here to try again</a></p>
                </div>
              </body></html>`
            });
          } else {
            resolve({
              statusCode: 500,
              body: JSON.stringify({ error: err.message }),
            });
          }
        }
      });

      bb.end(Buffer.from(event.body, 'base64'));
    });
  }

  const html = `<!DOCTYPE html>
  <html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Create New Provider</title>
  <style>
    body { font-family: 'Segoe UI', sans-serif; background: #000; color: #fff; padding: 1em; max-width: 900px; margin: auto; }
    h1, h2, h3 { color: #ffcc00; }
    form { background: #111; padding: 1em; border-radius: 8px; }
    label { display: block; margin-bottom: 1em; font-weight: bold; color: #ffcc00; }
    input, textarea { width: 100%; padding: 0.6em; background: #222; color: #fff; border: 1px solid #444; border-radius: 4px; box-sizing: border-box; margin-top: 0.4em; }
    button { background-color: #ffcc00; color: #000; font-weight: bold; padding: 0.7em 1.2em; border: none; border-radius: 4px; cursor: pointer; width: 100%; }
    button:hover { background-color: #ffaa00; }
    .logout { text-align: right; margin-bottom: 1em; }
    .logout a { color: #ffcc00; font-weight: bold; text-decoration: none; }
  </style>
  </head><body>
    <div class="logout"><a href="/admin/logout">Logout</a></div>
    <h1>Create New Provider</h1>
    <form method="POST" enctype="multipart/form-data">
      <label>Provider ID: <input name="provider_id" required /></label>
      <label>Name: <input name="name" /></label>
      <label>Bio: <textarea name="bio"></textarea></label>
      <label>Website: <input name="website" /></label>
      <label>Facebook: <input name="facebook" /></label>
      <label>Instagram: <input name="instagram" /></label>
      <label>YouTube: <input name="youtube" /></label>
      <label>Upload Logo: <input type="file" name="logo" accept="image/*" /></label>
      <label>Password: <input type="password" name="login_password" /></label>

      <button type="submit">Create Provider</button>
    </form>
  </body></html>`;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: html,
  };
};
