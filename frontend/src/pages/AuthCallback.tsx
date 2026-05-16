import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { Box, CircularProgress, Typography } from '@mui/material';

// react-oidc-context auto-runs the signin callback when it sees ?code=... in the URL,
// strips the query (via onSigninCallback in authConfig), and updates auth state.
// We just wait for isAuthenticated to flip then redirect.
export const AuthCallback = () => {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (auth.isAuthenticated) navigate('/dashboard', { replace: true });
  }, [auth.isAuthenticated, navigate]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: 16, gap: 2 }}>
      <CircularProgress />
      <Typography variant="body2">Completing sign-in…</Typography>
      {auth.error && <Typography color="error">{auth.error.message}</Typography>}
    </Box>
  );
};
