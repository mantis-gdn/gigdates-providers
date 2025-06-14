// netlify/functions/provider-profile.js
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
        Location: `/providers/${providerId}/login`,
      },
      body: 'Redirecting to login...',
    };
  }

  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: true },
  });

  if (
    event.httpMethod === 'POST' &&
    event.headers['content-type'].startsWith('multipart/form-data')
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
            // No file was uploaded
            logoUploadPromise = Promise.resolve(null);
            file.resume(); // Drain the stream to avoid hanging
          }
        }
      });

      bb.on('finish', async () => {
        try {
          const logoUrl = await logoUploadPromise;
          const finalLogoUrl = logoUrl || fields.logo_url || '';

          const [[currentProvider]] = await pool.query(
            'SELECT login_password FROM providers WHERE provider_id = ?',
            [providerId]
          );
          let hashedPassword = currentProvider.login_password;

          if (
            fields.login_password &&
            fields.login_password.trim() !== ''
          ) {
            const isSame = await bcrypt
              .compare(fields.login_password, currentProvider.login_password)
              .catch(() => false);
            if (!isSame) {
              const salt = await bcrypt.genSalt(10);
              hashedPassword = await bcrypt.hash(fields.login_password, salt);
            }
          }

          await pool.query(
            `UPDATE providers SET name = ?, bio = ?, website = ?, facebook = ?, instagram = ?, youtube = ?, logo_url = ?, login_password = ? WHERE provider_id = ?`,
            [
              fields.name,
              fields.bio,
              fields.website,
              fields.facebook,
              fields.instagram,
              fields.youtube,
              finalLogoUrl,
              hashedPassword,
              providerId,
            ]
          );

          resolve({
            statusCode: 302,
            headers: {
              Location: `/providers/${providerId}/admin/profile`,
            },
            body: 'Redirecting...',
          });
        } catch (err) {
          reject({
            statusCode: 500,
            body: JSON.stringify({ error: err.message }),
          });
        }
      });

      bb.end(Buffer.from(event.body, 'base64'));
    });
  }

  const [[provider]] = await pool.query(
    'SELECT * FROM providers WHERE provider_id = ?',
    [providerId]
  );

  const html = `<!DOCTYPE html>
  <html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Edit Provider Profile</title>
    <style>
      body { font-family: sans-serif; background: #000; color: #fff; padding: 1em; }
      h1 { color: #ffcc00; }
      nav { margin-bottom: 1em; }
      .nav-btn {
        display: inline-block;
        padding: 0.5em 1em;
        border: none;
        border-radius: 5px;
        font-weight: bold;
        cursor: pointer;
        text-decoration: none;
        color: #fff;
      }
      .blue { background-color: #007bff; }
      .purple { background-color: #6f42c1; }
      .teal { background-color: #20c997; }
      .red { background-color: #dc3545; }
      .nav-btn:hover { opacity: 0.85; }
      label { display: block; margin-top: 1em; }
      input, textarea {
        width: 100%;
        padding: 0.5em;
        background: #333;
        color: #ffcc00;
        border: 1px solid #555;
        border-radius: 4px;
      }
      button {
        margin-top: 1em;
        padding: 0.5em 1em;
        background: #ffcc00;
        color: #000;
        border: none;
        font-weight: bold;
        cursor: pointer;
      }
    </style></head><body>
    <h1>Edit Profile for ${provider.name}</h1>
    <nav>
      <a class="nav-btn blue" href="/providers/${providerId}/admin">Dashboard</a>
      <a class="nav-btn purple" href="/providers/${providerId}/admin/stats">Stats</a>
      <a class="nav-btn teal" href="/providers/${providerId}/admin/profile">Profile</a>
      <a class="nav-btn red" href="/providers/${providerId}/logout">Logout</a>
    </nav>
    <form method="POST" enctype="multipart/form-data">
      <label>Name: <input name="name" value="${provider.name}" /></label>
      <label>Bio: <textarea name="bio">${provider.bio || ''}</textarea></label>
      <label>Website: <input name="website" value="${provider.website || ''}" /></label>
      <label>Facebook: <input name="facebook" value="${provider.facebook || ''}" /></label>
      <label>Instagram: <input name="instagram" value="${provider.instagram || ''}" /></label>
      <label>YouTube: <input name="youtube" value="${provider.youtube || ''}" /></label>
      <label>Logo URL: <input name="logo_url" value="${provider.logo_url || ''}" /></label>
      <label>Upload Logo: <input type="file" name="logo" accept="image/*" /></label>
      <label>New Password: <input type="password" name="login_password" /></label>
      <button type="submit">Save Changes</button>
    </form>
  </body></html>`;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: html,
  };
};
