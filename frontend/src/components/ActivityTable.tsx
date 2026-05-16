import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { Chip } from '@mui/material';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

import type { EventRow } from '../api/hooks';

dayjs.extend(relativeTime);

const outcomeColor: Record<string, 'success' | 'error' | 'default'> = {
  ok: 'success',
  error: 'error',
};

const cols: GridColDef[] = [
  {
    field: 'ts',
    headerName: 'When',
    width: 140,
    renderCell: (params) => {
      const v = params.value as string | undefined;
      if (!v) return '—';
      return <span title={v}>{dayjs(v).fromNow()}</span>;
    },
  },
  { field: 'source', headerName: 'Source', width: 110 },
  { field: 'handler', headerName: 'Handler', width: 180 },
  {
    field: 'outcome',
    headerName: 'Outcome',
    width: 110,
    renderCell: (params) => {
      const v = (params.value as string | undefined) ?? '?';
      return <Chip label={v} size="small" color={outcomeColor[v] ?? 'default'} />;
    },
  },
  { field: 'team_id', headerName: 'team_id', width: 130 },
  { field: 'install_id', headerName: 'install_id', width: 130 },
  { field: 'event_type', headerName: 'Event', width: 160 },
  { field: 'reason', headerName: 'Reason', flex: 1, minWidth: 160 },
];

export const ActivityTable = ({ rows }: { rows: EventRow[] }) => {
  const withIds = rows.map((r, i) => ({ id: `${r.ts}-${i}`, ...r }));
  return (
    <DataGrid
      autoHeight
      rows={withIds}
      columns={cols}
      pageSizeOptions={[25, 50, 100]}
      initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
      disableRowSelectionOnClick
      density="compact"
    />
  );
};
