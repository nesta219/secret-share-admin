import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { Chip, Box } from '@mui/material';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import duration from 'dayjs/plugin/duration';

import type { SecretLifecycle } from '../api/hooks';

dayjs.extend(relativeTime);
dayjs.extend(duration);

const resolutionColor: Record<SecretLifecycle['resolution'], 'success' | 'warning' | 'default'> = {
  retrieved: 'success',
  expired: 'warning',
  pending: 'default',
};

const resolutionLabel: Record<SecretLifecycle['resolution'], string> = {
  retrieved: 'retrieved',
  expired: 'expired unread',
  pending: 'pending',
};

const formatAge = (seconds: number | null): string => {
  if (seconds === null) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
};

const cols: GridColDef<SecretLifecycle>[] = [
  {
    field: 'created_at',
    headerName: 'Created',
    width: 140,
    renderCell: (params) => {
      const v = params.value as string | null;
      if (!v) return <em>—</em>;
      return <span title={v}>{dayjs(v).fromNow()}</span>;
    },
  },
  {
    field: 'source',
    headerName: 'Source',
    width: 110,
    renderCell: (params) => <Chip size="small" label={params.value as string} variant="outlined" />,
  },
  {
    field: 'secret_id',
    headerName: 'Secret ID',
    width: 130,
    renderCell: (params) => (
      <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85em' }}>
        {params.value as string}
      </code>
    ),
  },
  {
    field: 'resolution',
    headerName: 'Status',
    width: 160,
    renderCell: (params) => {
      const v = params.value as SecretLifecycle['resolution'];
      return <Chip size="small" label={resolutionLabel[v]} color={resolutionColor[v]} />;
    },
  },
  {
    field: 'age_seconds',
    headerName: 'Age',
    width: 90,
    renderCell: (params) => formatAge(params.value as number | null),
  },
  {
    field: 'resolved_at',
    headerName: 'Resolved',
    width: 140,
    renderCell: (params) => {
      const v = params.value as string | null;
      if (!v) return <em>—</em>;
      return <span title={v}>{dayjs(v).fromNow()}</span>;
    },
  },
];

export const SecretsTable = ({ lifecycles }: { lifecycles: SecretLifecycle[] }) => {
  const rows = lifecycles.map((lc) => ({ id: lc.secret_id, ...lc }));
  return (
    <Box sx={{ width: '100%' }}>
      <DataGrid
        autoHeight
        rows={rows}
        columns={cols}
        pageSizeOptions={[25, 50, 100]}
        initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
        disableRowSelectionOnClick
        density="compact"
      />
    </Box>
  );
};
