import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import {
  AppBar,
  Avatar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Typography,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import IntegrationInstructionsIcon from '@mui/icons-material/IntegrationInstructions';
import HistoryIcon from '@mui/icons-material/History';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';

const DRAWER_WIDTH = 220;

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
  { to: '/integrations', label: 'Integrations', icon: <IntegrationInstructionsIcon /> },
  { to: '/activity', label: 'Activity', icon: <HistoryIcon /> },
  { to: '/health', label: 'Health', icon: <MonitorHeartIcon /> },
];

export const AppShell = () => {
  const auth = useAuth();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const email = (auth.user?.profile.email as string | undefined) ?? '?';
  const navigate = useNavigate();

  const signOut = () => {
    setMenuAnchor(null);
    auth.signoutRedirect();
  };

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1, cursor: 'pointer' }} onClick={() => navigate('/dashboard')}>
            send-a-secret admin
          </Typography>
          <Typography variant="body2" sx={{ mr: 1, opacity: 0.85 }}>
            {email}
          </Typography>
          <IconButton onClick={(e) => setMenuAnchor(e.currentTarget)} color="inherit">
            <Avatar sx={{ width: 32, height: 32, fontSize: 14 }}>
              {email.slice(0, 1).toUpperCase()}
            </Avatar>
          </IconButton>
          <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
            <MenuItem onClick={signOut}>Sign out</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: DRAWER_WIDTH, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <List>
          {navItems.map((item) => (
            <ListItem key={item.to} disablePadding>
              <ListItemButton
                component={NavLink}
                to={item.to}
                sx={{
                  '&.active': { backgroundColor: 'action.selected' },
                }}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
};
