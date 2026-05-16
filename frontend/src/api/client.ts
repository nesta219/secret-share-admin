import axios from 'axios';
import { User } from 'oidc-client-ts';

const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;

const storageKey = `oidc.user:https://cognito-idp.us-east-1.amazonaws.com/${userPoolId}:${clientId}`;

const getStoredUser = (): User | null => {
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    return User.fromStorageString(raw);
  } catch {
    return null;
  }
};

export const api = axios.create({ baseURL: '/api/admin' });

api.interceptors.request.use((config) => {
  const user = getStoredUser();
  if (user?.id_token) {
    config.headers.Authorization = `Bearer ${user.id_token}`;
  }
  return config;
});
