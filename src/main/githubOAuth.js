// GitHub OAuth device flow.
//
// Implements the GitHub device flow (RFC 8628) for obtaining an access token
// without embedding a client secret in the desktop app. The user visits a URL,
// enters a code, and Meg polls GitHub until they authorize.
//
// To use this in production, register a GitHub OAuth app at:
//   https://github.com/settings/developers
// Set the callback URL to "http://localhost" (device flow doesn't need a
// real callback — the user enters the code manually).
//
// Until a real client ID is configured, the module uses a placeholder and
// the flow will fail at the device-code request step. The code is complete
// and ready — just set GITHUB_CLIENT_ID in settings or environment.

const GITHUB_DEVICE_URL = 'https://github.com/login/device/code';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const POLL_INTERVAL_MS = 5000;

// Default client ID — replace with a real one from GitHub OAuth app settings.
// Can be overridden via settings key `githubClientId` or env var GITHUB_CLIENT_ID.
const DEFAULT_CLIENT_ID = '';
const SCOPES = 'repo read:user read:org';

/**
 * Start the device flow. Returns the device code response from GitHub:
 * { device_code, user_code, verification_uri, expires_in, interval }
 * The caller should display user_code + verification_uri to the user.
 */
async function requestDeviceCode(clientId = DEFAULT_CLIENT_ID) {
  const id = clientId || process.env.GITHUB_CLIENT_ID || '';
  if (!id) {
    return { error: 'No GitHub OAuth client ID configured. Register an OAuth app at https://github.com/settings/developers and set the client ID in Settings.' };
  }

  const res = await fetch(GITHUB_DEVICE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      client_id: id,
      scope: SCOPES,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { error: err.error_description || err.error || `GitHub returned ${res.status}` };
  }

  return res.json();
}

/**
 * Poll for an access token. Resolves with { access_token, token_type, scope }
 * once the user authorizes, or { error } if they deny or it expires.
 *
 * @param {string} deviceCode - The device_code from requestDeviceCode
 * @param {string} clientId - The OAuth client ID
 * @param {number} interval - Polling interval in seconds (from GitHub response)
 * @param {function} onPoll - Optional callback called on each poll attempt
 * @returns {Promise<object>}
 */
async function pollForToken(deviceCode, clientId = DEFAULT_CLIENT_ID, interval = 5, onPoll = null) {
  const id = clientId || process.env.GITHUB_CLIENT_ID || '';

  return new Promise((resolve) => {
    const poll = async () => {
      if (onPoll) onPoll();

      try {
        const res = await fetch(GITHUB_TOKEN_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            client_id: id,
            device_code: deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          }),
        });

        const json = await res.json();

        if (json.access_token) {
          resolve({ access_token: json.access_token, token_type: json.token_type, scope: json.scope });
          return;
        }

        if (json.error === 'authorization_pending') {
          setTimeout(poll, (interval || 5) * 1000);
          return;
        }

        if (json.error === 'slow_down') {
          setTimeout(poll, ((interval || 5) + 5) * 1000);
          return;
        }

        if (json.error === 'expired_token') {
          resolve({ error: 'The device code expired. Please try again.' });
          return;
        }

        if (json.error === 'access_denied') {
          resolve({ error: 'Authorization was denied.' });
          return;
        }

        resolve({ error: json.error_description || json.error || 'Unknown error' });
      } catch (e) {
        resolve({ error: e.message });
      }
    };

    setTimeout(poll, POLL_INTERVAL_MS);
  });
}

module.exports = {
  requestDeviceCode,
  pollForToken,
  DEFAULT_CLIENT_ID,
  SCOPES,
};
