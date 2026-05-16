import type { AuthProviderProps } from 'react-oidc-context';
import { WebStorageStateStore } from 'oidc-client-ts';

const region = 'us-east-1';
const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
const domain = import.meta.env.VITE_COGNITO_DOMAIN;
const redirectUri = import.meta.env.VITE_REDIRECT_URI;
const logoutUri = import.meta.env.VITE_LOGOUT_URI;

// We point `authority` at Cognito's standard OIDC discovery URL, which returns
// metadata including the authorize_endpoint on the user-pool's hosted-UI domain.
// `metadata` overrides cover the cases where Cognito's discovery doc lacks an
// end_session_endpoint (Cognito's hosted-UI logout is `/logout`, not `/oauth2/logout`).
export const authConfig: AuthProviderProps = {
  authority: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`,
  client_id: clientId,
  redirect_uri: redirectUri,
  post_logout_redirect_uri: logoutUri,
  response_type: 'code',
  scope: 'openid email profile',
  loadUserInfo: false,
  automaticSilentRenew: true,
  userStore: new WebStorageStateStore({ store: window.localStorage }),
  metadataSeed: {
    end_session_endpoint: `https://${domain}/logout?client_id=${encodeURIComponent(
      clientId,
    )}&logout_uri=${encodeURIComponent(logoutUri)}`,
  },
  onSigninCallback: () => {
    // Strip the ?code=...&state=... query params after the exchange completes so
    // the URL bar stays clean and a reload doesn't re-trigger the exchange.
    window.history.replaceState({}, document.title, window.location.pathname);
  },
};
