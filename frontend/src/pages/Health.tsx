import { Box, CircularProgress, Typography, Alert } from '@mui/material';

import { useHealth } from '../api/hooks';
import { AlarmList } from '../components/AlarmList';

export const Health = () => {
  const health = useHealth();

  if (health.isLoading) return <CircularProgress />;
  if (health.error) return <Alert severity="error">{(health.error as Error).message}</Alert>;

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>Health</Typography>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>Alarms</Typography>
      <AlarmList alarms={health.data?.alarms ?? []} />
    </Box>
  );
};
