/**
 * Yifu Hou -23009975
 *
 * Flow:
 *   1. LandingPage renders a link to getLoginUrl().
 *   2. User authenticates on Cognito's hosted login page.
 *   3. Cognito redirects back to REDIRECT_URI?code=xxx.
 *   4. App.jsx detects the ?code param and calls exchangeCodeForTokens().
 *   5. Tokens are stored in localStorage; the app renders the dashboard.
 */

import config from './config';


const TOKEN_URL = `https://${config.COGNITO.DOMAIN}/oauth2/token`;


/** Decode the payload of a JWT without verification  */
function parseJwt(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

/** Remove all Cognito tokens from localStorage. */
function clearTokens() {
  localStorage.removeItem('cog_id_token');
  localStorage.removeItem('cog_access_token');
  localStorage.removeItem('cog_refresh_token');
  localStorage.removeItem('cog_user');
}

/* Hosted UI URLs  */
/**
 * Build the Cognito /login URL with OAuth authorisation-code parameters.
 * The user is redirected here from the LandingPage "Sign In" button.
 */
export function getLoginUrl() {
  const params = new URLSearchParams({
    client_id: config.COGNITO.CLIENT_ID,
    redirect_uri: config.COGNITO.REDIRECT_URI,
    response_type: 'code',
    scope: config.COGNITO.SCOPES
  });
  return `https://${config.COGNITO.DOMAIN}/login?${params.toString()}`;
}

/**
 * Build the Cognito /logout URL.
 * After clearing local tokens, redirect the browser here to also
 * clear the Cognito session cookie. Cognito will then redirect
 * back to LOGOUT_URI (our landing page).
 */
export function getLogoutUrl() {
  const params = new URLSearchParams({
    client_id: config.COGNITO.CLIENT_ID,
    logout_uri: config.COGNITO.LOGOUT_URI
  });
  return `https://${config.COGNITO.DOMAIN}/logout?${params.toString()}`;
}

/**
 * Exchange an OAuth authorisation code for JWT tokens.
 * Called by App.jsx when it detects ?code= in the URL.
 *
 * The token endpoint expects form-urlencoded body (OAuth 2.0 spec).
 */
export async function exchangeCodeForTokens(code) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.COGNITO.CLIENT_ID,
    code,
    redirect_uri: config.COGNITO.REDIRECT_URI
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || err.error || 'Token exchange failed');
  }
  const data = await res.json();
  const payload = parseJwt(data.id_token);

  // Persist tokens so the session survives page reloads
  localStorage.setItem('cog_id_token', data.id_token);
  localStorage.setItem('cog_access_token', data.access_token);
  if (data.refresh_token) localStorage.setItem('cog_refresh_token', data.refresh_token);
  localStorage.setItem('cog_user', JSON.stringify(payload));

  return { user: payload };
}

/*  Session validation & refresh  */

/**
 * Check whether the user has a valid session.
 *
 * Returns a session-like object on success (so the existing App.jsx
 * contract stays compatible), or throws if no valid session exists.
 *
 * If the id_token is expired but a refresh_token is available,
 * attempts a silent refresh via the Cognito token endpoint.
 */
export async function getCurrentSession() {
  const idToken = localStorage.getItem('cog_id_token');
  const refreshToken = localStorage.getItem('cog_refresh_token');

  if (!idToken) throw new Error('No session');

  const payload = parseJwt(idToken);
  if (!payload) throw new Error('Invalid token');

  const now = Math.floor(Date.now() / 1000);

  // id_token still valid with a 60-second grace period
  if (payload.exp && payload.exp > now + 60) {
    return { getIdToken: () => ({ getJwtToken: () => idToken, payload }) };
  }

  // Token expired — attempt refresh if we have a refresh_token
  if (!refreshToken) {
    clearTokens();
    throw new Error('Token expired');
  }

  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.COGNITO.CLIENT_ID,
      refresh_token: refreshToken
    });

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    if (!res.ok) {
      clearTokens();
      throw new Error('Refresh failed');
    }

    const data = await res.json();
    const newPayload = parseJwt(data.id_token);

    // Update stored tokens (Cognito may or may not rotate the refresh_token)
    localStorage.setItem('cog_id_token', data.id_token);
    if (data.access_token) localStorage.setItem('cog_access_token', data.access_token);
    localStorage.setItem('cog_user', JSON.stringify(newPayload));

    return { getIdToken: () => ({ getJwtToken: () => data.id_token, payload: newPayload }) };
  } catch {
    clearTokens();
    throw new Error('Session expired');
  }
}


export function signOut() {
  clearTokens();
}
