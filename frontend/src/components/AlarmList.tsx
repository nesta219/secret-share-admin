import { Chip, List, ListItem, ListItemText, Typography } from '@mui/material';
import dayjs from 'dayjs';

import type { AlarmRow } from '../api/hooks';

const stateColor: Record<string, 'success' | 'error' | 'warning' | 'default'> = {
  OK: 'success',
  ALARM: 'error',
  INSUFFICIENT_DATA: 'warning',
};

export const AlarmList = ({ alarms }: { alarms: AlarmRow[] }) => {
  if (alarms.length === 0) {
    return <Typography variant="body2" color="text.secondary">No alarms found.</Typography>;
  }
  const sorted = [...alarms].sort((a, b) => {
    const order = (s: string) => (s === 'ALARM' ? 0 : s === 'INSUFFICIENT_DATA' ? 1 : 2);
    return order(a.state) - order(b.state);
  });
  return (
    <List dense disablePadding>
      {sorted.map((a) => (
        <ListItem key={a.name ?? Math.random()} divider>
          <ListItemText
            primary={a.name ?? '(unnamed)'}
            secondary={
              <>
                <Chip size="small" label={a.state} color={stateColor[a.state] ?? 'default'} sx={{ mr: 1 }} />
                {a.updated_at && (
                  <Typography component="span" variant="caption" color="text.secondary">
                    updated {dayjs(a.updated_at).format('YYYY-MM-DD HH:mm:ss')}
                  </Typography>
                )}
                {a.reason && (
                  <Typography component="div" variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                    {a.reason}
                  </Typography>
                )}
              </>
            }
          />
        </ListItem>
      ))}
    </List>
  );
};
