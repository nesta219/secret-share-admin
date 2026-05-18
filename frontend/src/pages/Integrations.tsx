import { useState, useEffect } from 'react';
import { Box, Tab, Tabs, Typography, CircularProgress, Alert } from '@mui/material';

import { useIntegrations, useInstalls } from '../api/hooks';
import { InstallsTable } from '../components/InstallsTable';

export const Integrations = () => {
  const integrations = useIntegrations();
  const list = integrations.data?.integrations ?? [];
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (active === null && list.length > 0) setActive(list[0].name);
  }, [active, list]);

  const installs = useInstalls(active ?? undefined);

  if (integrations.isLoading) return <CircularProgress />;
  if (list.length === 0) return <Alert severity="info">No platform integrations configured.</Alert>;

  const activeIntegration = list.find((i) => i.name === active);

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>Integrations</Typography>
      <Tabs value={active} onChange={(_, v) => setActive(v)} sx={{ mb: 2 }}>
        {list.map((i) => (
          <Tab
            key={i.name}
            value={i.name}
            label={i.deployed ? i.display_name : `${i.display_name} (not deployed)`}
          />
        ))}
      </Tabs>

      {activeIntegration && (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Table: {activeIntegration.table_name} · PK {activeIntegration.hash_key}
            {activeIntegration.type_discriminator && ` · discriminator ${activeIntegration.type_discriminator}`}
          </Typography>
          {installs.isLoading && <CircularProgress />}
          {installs.error && <Alert severity="error">{(installs.error as Error).message}</Alert>}
          {installs.data?.not_deployed && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {activeIntegration.display_name} backend isn't deployed in this environment yet
              (table <code>{activeIntegration.table_name}</code> doesn't exist).
            </Alert>
          )}
          {installs.data && !installs.data.not_deployed && (
            <>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                {installs.data.count} install{installs.data.count === 1 ? '' : 's'}
              </Typography>
              <InstallsTable integration={activeIntegration} installs={installs.data.installs} />
            </>
          )}
        </>
      )}
    </Box>
  );
};
