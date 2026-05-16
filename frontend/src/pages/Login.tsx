import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { Box, Button, Card, CardContent, Typography, CircularProgress } from '@mui/material';

export const Login = () => {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (auth.isAuthenticated) navigate('/dashboard', { replace: true });
  }, [auth.isAuthenticated, navigate]);

  if (auth.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 16 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
      }}
    >
      <Card variant="outlined" sx={{ maxWidth: 420, width: '100%' }}>
        <CardContent>
          <Typography variant="h5" sx={{ mb: 1 }}>send-a-secret admin</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Authorized personnel only. Sign in with your Cognito account.
          </Typography>
          <Button fullWidth variant="contained" onClick={() => auth.signinRedirect()}>
            Sign in
          </Button>
          {auth.error && (
            <Typography color="error" variant="body2" sx={{ mt: 2 }}>
              {auth.error.message}
            </Typography>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};
