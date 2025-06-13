// netlify/functions/provider-logout.js

exports.handler = async function(event) {
  const match = event.path.match(/\/providers\/([^\/]+)\/logout/);
  const providerId = match ? match[1] : null;

  if (!providerId) {
    return {
      statusCode: 400,
      body: 'Missing provider ID'
    };
  }

  return {
    statusCode: 302,
    headers: {
      'Set-Cookie': 'provider_id=; Max-Age=0; Path=/; HttpOnly; Secure',
      Location: `/providers/${providerId}/login`
    },
    body: 'Logging out...'
  };
};
