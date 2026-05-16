import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { Box, CircularProgress, Typography } from '@mui/material';

export const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const auth = useAuth();

  if (auth.isLoading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: 16, gap: 2 }}>
        <CircularProgress />
        <Typography variant="body2">Loading session…</Typography>
      </Box>
    );
  }

  if (auth.error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">Auth error: {auth.error.message}</Typography>
      </Box>
    );
  }

  if (!auth.isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
};
