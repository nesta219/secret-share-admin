// Platform configs come from PLATFORMS_JSON env var, populated by Terraform from
// the platforms list in env.hcl. Adding a new platform = add a row in env.hcl;
// no code change in this file.

export interface Platform {
  name: string;
  display_name: string;
  table_name: string;
  table_arn: string;
  hash_key: string;
  display_name_field: string;
  type_discriminator: string; // "" if not used
  safe_fields: string[];
  sensitive_fields: string[];
  log_group_prefix: string;
  install_handler: string;
  uninstall_handler: string; // "" if platform has no uninstall event
  uninstall_event_type: string;
}

let cached: Platform[] | null = null;

export const loadPlatforms = (): Platform[] => {
  if (cached !== null) return cached;
  const raw = process.env.PLATFORMS_JSON;
  if (!raw) throw new Error('PLATFORMS_JSON env var is required');
  const parsed = JSON.parse(raw) as Platform[];
  if (!Array.isArray(parsed)) throw new Error('PLATFORMS_JSON must be a JSON array');
  cached = parsed;
  return parsed;
};

export const findPlatform = (name: string): Platform | null => {
  return loadPlatforms().find((p) => p.name === name) ?? null;
};

// Defense in depth: even though installs.ts projects to safe_fields explicitly,
// this redact function strips any sensitive_fields entries that somehow slip
// through. Use both — never one or the other.
export const projectSafe = (
  platform: Platform,
  item: Record<string, unknown>,
): Record<string, unknown> => {
  const projected: Record<string, unknown> = {};
  for (const field of platform.safe_fields) {
    if (field in item) projected[field] = item[field];
  }
  for (const banned of platform.sensitive_fields) {
    delete projected[banned];
  }
  return projected;
};
