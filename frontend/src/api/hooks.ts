import { useQuery } from '@tanstack/react-query';

import { api } from './client';

export interface Integration {
  name: string;
  display_name: string;
  table_name: string;
  hash_key: string;
  display_name_field: string;
  type_discriminator: string | null;
  log_group_prefix: string;
}

export interface Install {
  [key: string]: unknown;
}

export interface InstallsResponse {
  platform: string;
  display_name: string;
  installs: Install[];
  count: number;
  next: string | null;
}

export interface EventRow {
  ts: string;
  handler?: string;
  outcome?: string;
  source?: string;
  team_id?: string;
  install_id?: string;
  event_type?: string;
  reason?: string;
  raw: string;
}

export interface EventsResponse {
  queryId: string | null;
  complete: boolean;
  events: EventRow[];
}

export interface StatsResponse {
  range: string;
  namespace: string;
  totals: Record<string, number>;
  series: Record<string, Array<[string, number]>>;
}

export interface AlarmRow {
  name: string | null;
  state: string;
  reason: string | null;
  updated_at: string | null;
}

export interface HealthResponse {
  alarms: AlarmRow[];
}

export const useMe = () =>
  useQuery({
    queryKey: ['me'],
    queryFn: async () => (await api.get('/me')).data as { sub: string; email: string | null },
  });

export const useIntegrations = () =>
  useQuery({
    queryKey: ['integrations'],
    queryFn: async () => (await api.get('/integrations')).data as { integrations: Integration[] },
  });

export const useInstalls = (platform: string | undefined) =>
  useQuery({
    queryKey: ['installs', platform],
    queryFn: async () =>
      (await api.get(`/integrations/${platform}/installs`)).data as InstallsResponse,
    enabled: !!platform,
  });

export const useEvents = (params: {
  since?: string;
  handler?: string;
  outcome?: string;
  team_id?: string;
  limit?: number;
}) =>
  useQuery({
    queryKey: ['events', params],
    queryFn: async () => (await api.get('/events', { params })).data as EventsResponse,
    refetchInterval: 15_000,
  });

export const useStats = (range: '1h' | '24h' | '7d' | '30d' = '24h') =>
  useQuery({
    queryKey: ['stats', range],
    queryFn: async () => (await api.get('/stats', { params: { range } })).data as StatsResponse,
    refetchInterval: 60_000,
  });

export const useHealth = () =>
  useQuery({
    queryKey: ['health'],
    queryFn: async () => (await api.get('/health')).data as HealthResponse,
    refetchInterval: 30_000,
  });
