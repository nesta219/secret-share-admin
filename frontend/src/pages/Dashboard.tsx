import { Box, Grid, Typography, CircularProgress } from '@mui/material';

import { StatCard } from '../components/StatCard';
import { useIntegrations, useStats, useHealth } from '../api/hooks';

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const Dashboard = () => {
  const integrations = useIntegrations();
  const stats = useStats('24h');
  const health = useHealth();

  if (integrations.isLoading || stats.isLoading || health.isLoading) {
    return <CircularProgress />;
  }

  const created = stats.data?.totals.SecretsCreated ?? 0;
  const retrieved = stats.data?.totals.SecretsRetrieved ?? 0;
  const canaryRecent = stats.data?.series.CanarySuccess ?? [];
  const lastCanary = canaryRecent.length > 0 ? canaryRecent[canaryRecent.length - 1][1] : null;

  const firingAlarms = health.data?.alarms.filter((a) => a.state === 'ALARM') ?? [];

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>Dashboard</Typography>

      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Secrets created (24h)" value={created} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Secrets retrieved (24h)" value={retrieved} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Canary"
            value={lastCanary === null ? '—' : lastCanary === 1 ? 'OK' : 'FAIL'}
            accent={lastCanary === 1 ? 'success' : lastCanary === null ? 'default' : 'error'}
            subtitle="put + get round-trip, every 5 min"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Active alarms"
            value={firingAlarms.length}
            accent={firingAlarms.length === 0 ? 'success' : 'error'}
            subtitle={firingAlarms.length > 0 ? firingAlarms[0].name ?? '' : 'all green'}
          />
        </Grid>

        {(integrations.data?.integrations ?? []).map((integration) => {
          const total = stats.data?.totals[`${titleCase(integration.name)}Installs`] ?? 0;
          return (
            <Grid item xs={12} sm={6} md={3} key={integration.name}>
              <StatCard
                title={`${integration.display_name} installs (24h)`}
                value={total}
                subtitle={integration.table_name}
              />
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
};
