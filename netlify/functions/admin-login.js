exports.handler = async function (event) {
  const isPost = event.httpMethod === 'POST';

  if (isPost && event.headers['content-type']?.includes('multipart/form-data')) {
    const busboy = require('busboy');
    return new Promise((resolve, reject) => {
      const bb = busboy({ headers: event.headers });
      const fields = {};

      bb.on('field', (name, val) => {
        fields[name] = val;
      });

      bb.on('finish', () => {
        if (fields.auth === process.env.ADMIN_PASSWORD) {
          return resolve({
            statusCode: 302,
            headers: {
              'Set-Cookie': `admin_auth=${process.env.ADMIN_PASSWORD}; HttpOnly; Path=/; Max-Age=86400`,
              Location: '/admin'
            },
            body: 'Redirecting...'
          });
        } else {
          return resolve({
            statusCode: 200,
            headers: { 'Content-Type': 'text/html' },
            body: renderLoginForm('Invalid password.')
          });
        }
      });

      bb.end(event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body);
    });
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: renderLoginForm()
  };
};

function renderLoginForm(error = '') {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Admin Login</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="background:#000; color:#fff; font-family:sans-serif; padding:40px; text-align:center;">
  <h1>Admin Login</h1>
  ${error ? `<p style="color:red;">${error}</p>` : ''}
  <form method="POST" enctype="multipart/form-data" style="max-width:300px; margin:auto;">
    <label for="auth">Admin Password</label><br><br>
    <input type="password" id="auth" name="auth" required style="padding:10px; width:100%; border-radius:6px;"><br><br>
    <button type="submit" style="padding:10px 20px; border:none; border-radius:6px; background:#1e90ff; color:#fff; cursor:pointer;">Login</button>
  </form>
</body>
</html>
  `;
};
