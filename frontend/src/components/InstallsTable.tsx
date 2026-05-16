import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

import type { Install, Integration } from '../api/hooks';

dayjs.extend(relativeTime);

interface Props {
  integration: Integration;
  installs: Install[];
}

// Generic table — derives columns from the integration's hash_key,
// display_name_field, and type_discriminator. Adding a new platform = no change here.
export const InstallsTable = ({ integration, installs }: Props) => {
  const cols: GridColDef[] = [
    { field: integration.hash_key, headerName: 'ID', flex: 1, minWidth: 180 },
    {
      field: integration.display_name_field,
      headerName: 'Name',
      flex: 1,
      minWidth: 200,
      valueGetter: (_, row: Install) => row[integration.display_name_field] ?? '—',
    },
  ];
  if (integration.type_discriminator) {
    cols.push({ field: integration.type_discriminator, headerName: 'Type', width: 100 });
  }
  cols.push(
    { field: 'plan', headerName: 'Plan', width: 90 },
    { field: 'installer_user_id', headerName: 'Installer', width: 140 },
    {
      field: 'installed_at',
      headerName: 'Installed',
      width: 160,
      valueGetter: (_, row: Install) => row.installed_at,
      renderCell: (params) => {
        const value = params.value as string | undefined;
        if (!value) return '—';
        return <span title={value}>{dayjs(value).fromNow()}</span>;
      },
    },
  );

  const rows = installs.map((it, i) => ({
    id: (it[integration.hash_key] as string | undefined) ?? `row-${i}`,
    ...it,
  }));

  return (
    <DataGrid
      autoHeight
      rows={rows}
      columns={cols}
      pageSizeOptions={[25, 50, 100]}
      initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
      disableRowSelectionOnClick
    />
  );
};
