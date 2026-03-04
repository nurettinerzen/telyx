import axios from 'axios';

const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

/**
 * Best-effort token revocation for Google OAuth tokens.
 * Never logs token values.
 */
export async function revokeGoogleOAuthToken(token) {
  if (typeof token !== 'string' || token.length === 0) {
    return { attempted: false, revoked: false };
  }

  try {
    await axios.post(
      GOOGLE_REVOKE_ENDPOINT,
      new URLSearchParams({ token }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 8000
      }
    );
    return { attempted: true, revoked: true };
  } catch (error) {
    return {
      attempted: true,
      revoked: false,
      status: error?.response?.status ?? null
    };
  }
}

export default {
  revokeGoogleOAuthToken,
};
