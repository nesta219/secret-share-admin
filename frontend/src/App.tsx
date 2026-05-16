import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';

import { AppShell } from './components/AppShell';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { Activity } from './pages/Activity';
import { AuthCallback } from './pages/AuthCallback';
import { Dashboard } from './pages/Dashboard';
import { Health } from './pages/Health';
import { Integrations } from './pages/Integrations';
import { Login } from './pages/Login';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#286359' },
    secondary: { main: '#42786c' },
  },
});

export const App = () => (
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/health" element={<Health />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </ThemeProvider>
);
