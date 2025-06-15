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
      body {
        font-family: 'Segoe UI', sans-serif;
        background: #000;
        color: #fff;
        padding: 1em;
        margin: 0;
        max-width: 900px;
        margin-left: auto;
        margin-right: auto;
      }

      h1 {
        color: #ffcc00;
        text-align: center;
        font-size: 1.8em;
        margin-bottom: 1em;
      }

      nav {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5em;
        justify-content: center;
        margin-bottom: 1.5em;
      }

      .nav-btn {
        padding: 0.6em 1em;
        border-radius: 6px;
        font-weight: bold;
        color: #fff;
        text-align: center;
        text-decoration: none;
        flex: 1 1 auto;
      }

      .blue { background-color: #007bff; }
      .purple { background-color: #6f42c1; }
      .teal { background-color: #20c997; }
      .red { background-color: #dc3545; }
      .nav-btn:hover { opacity: 0.9; }

      form {
        background: #111;
        padding: 1em;
        border-radius: 8px;
      }

      label {
        display: block;
        margin-bottom: 1em;
        font-weight: bold;
        color: #ffcc00;
      }

      input, textarea {
        width: 100%;
        padding: 0.6em;
        background: #222;
        color: #fff;
        border: 1px solid #444;
        border-radius: 4px;
        box-sizing: border-box;
        margin-top: 0.4em;
      }

      button {
        background-color: #ffcc00;
        color: #000;
        font-weight: bold;
        padding: 0.7em 1.2em;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        width: 100%;
      }

      button:hover {
        background-color: #ffaa00;
      }

      img {
        max-width: 100%;
        height: auto;
        margin: 1em 0;
        border-radius: 8px;
      }

      @media (max-width: 768px) {
        body {
          padding: 1em;
        }

        nav {
          flex-direction: column;
        }

        h1 {
          font-size: 1.5em;
        }
      }
    </style>
    </head>
    <body>
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
      
      ${provider.logo_url ? `<img src="${provider.logo_url}" alt="Logo" style="max-width: 200px; margin-bottom: 1em; border-radius: 8px;" />` : ''}
      
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
