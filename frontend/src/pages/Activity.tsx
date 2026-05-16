import { useState } from 'react';
import {
  Box,
  Typography,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  TextField,
  MenuItem,
  CircularProgress,
  Alert,
} from '@mui/material';

import { useEvents } from '../api/hooks';
import { ActivityTable } from '../components/ActivityTable';

const ranges = { '1h': '-3600000', '24h': '-86400000', '7d': '-604800000', '30d': '-2592000000' };

export const Activity = () => {
  const [range, setRange] = useState<keyof typeof ranges>('1h');
  const [handler, setHandler] = useState('');
  const [outcome, setOutcome] = useState('');
  const [teamId, setTeamId] = useState('');

  const events = useEvents({
    since: ranges[range],
    handler: handler || undefined,
    outcome: outcome || undefined,
    team_id: teamId || undefined,
    limit: 200,
  });

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>Activity</Typography>
      <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={range}
          onChange={(_, v) => v && setRange(v)}
        >
          {Object.keys(ranges).map((r) => (
            <ToggleButton key={r} value={r}>{r}</ToggleButton>
          ))}
        </ToggleButtonGroup>
        <TextField
          size="small"
          label="handler"
          value={handler}
          onChange={(e) => setHandler(e.target.value)}
          sx={{ minWidth: 200 }}
        />
        <TextField
          size="small"
          label="outcome"
          select
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="">(any)</MenuItem>
          <MenuItem value="ok">ok</MenuItem>
          <MenuItem value="error">error</MenuItem>
        </TextField>
        <TextField
          size="small"
          label="team_id"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          sx={{ minWidth: 180 }}
        />
      </Stack>

      {events.isLoading && <CircularProgress />}
      {events.error && <Alert severity="error">{(events.error as Error).message}</Alert>}
      {events.data && (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            {events.data.events.length} row{events.data.events.length === 1 ? '' : 's'}
            {!events.data.complete && ' · query still running (will refresh)'}
          </Typography>
          <ActivityTable rows={events.data.events} />
        </>
      )}
    </Box>
  );
};
