import { useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  Grid,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';

import { useSecrets } from '../api/hooks';
import { StatCard } from '../components/StatCard';
import { SecretsTable } from '../components/SecretsTable';

const RANGES = ['1h', '24h', '7d', '30d'] as const;
type Range = (typeof RANGES)[number];

const pct = (numer: number, denom: number): string => {
  if (denom === 0) return '—';
  return `${Math.round((numer / denom) * 100)}%`;
};

export const Secrets = () => {
  const [range, setRange] = useState<Range>('24h');
  const query = useSecrets({ range });

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
        <Typography variant="h4">Secrets</Typography>
        <Typography variant="body2" color="text.secondary">
          one row per secret · privacy: never displays the payload
        </Typography>
      </Stack>

      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={range}
          onChange={(_, v) => v && setRange(v as Range)}
        >
          {RANGES.map((r) => (
            <ToggleButton key={r} value={r}>{r}</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      {query.isLoading && <CircularProgress />}
      {query.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(query.error as Error).message}
        </Alert>
      )}

      {query.data && (
        <>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={6} md={3}>
              <StatCard title={`Created (${range})`} value={query.data.summary.created} />
            </Grid>
            <Grid item xs={6} md={3}>
              <StatCard
                title="Retrieved"
                value={query.data.summary.retrieved}
                accent="success"
                subtitle={
                  query.data.summary.created > 0
                    ? `${pct(query.data.summary.retrieved, query.data.summary.created)} of created`
                    : 'no data'
                }
              />
            </Grid>
            <Grid item xs={6} md={3}>
              <StatCard
                title="Expired unread"
                value={query.data.summary.expired}
                accent={query.data.summary.expired > 0 ? 'warning' : 'default'}
                subtitle="TTL passed before retrieval"
              />
            </Grid>
            <Grid item xs={6} md={3}>
              <StatCard
                title="Pending"
                value={query.data.summary.pending}
                subtitle="created, not yet resolved"
              />
            </Grid>
          </Grid>

          {query.data.truncated && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Result set was capped at 5000 events. Narrow the range to see all entries.
            </Alert>
          )}

          {query.data.lifecycles.length === 0 ? (
            <Alert severity="info">
              No secret activity in the last {range}. Once the next put-item event hits the
              main app, it'll appear here within a few seconds (DynamoDB stream lag).
            </Alert>
          ) : (
            <SecretsTable lifecycles={query.data.lifecycles} />
          )}
        </>
      )}
    </Box>
  );
};
