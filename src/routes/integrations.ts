import { loadPlatforms } from '../lib/platforms.js';
import { ok } from '../lib/response.js';

// GET /api/admin/integrations — overview of every configured platform integration.
// Returns shape, fields, and live install counts (cached by scan; safe because
// admin reads only). Designed so adding a platform = no SPA code change either.
export const integrations = async () => {
  const platforms = loadPlatforms();
  return ok({
    integrations: platforms.map((p) => ({
      name: p.name,
      display_name: p.display_name,
      table_name: p.table_name,
      hash_key: p.hash_key,
      display_name_field: p.display_name_field,
      type_discriminator: p.type_discriminator || null,
      log_group_prefix: p.log_group_prefix,
    })),
  });
};
