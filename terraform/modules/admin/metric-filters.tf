locals {
  # Metric namespace = "SecretShare/${env}". Filters in the main app's log groups
  # need it scoped per env so dev and prod don't share counters.
  ns = "${var.metric_namespace}/${var.environment}"

  # Each platform produces an install filter; uninstall filter only if the platform
  # emits one (slack: app_uninstalled event; discord: no equivalent in phase 1).
  install_filters = {
    for p in var.platforms : p.name => p
  }
  uninstall_filters = {
    for p in var.platforms : p.name => p if p.uninstall_handler != ""
  }
}

# ============================================================
#   Main app filters — assume secret-share repo's log groups already exist.
#   Both Lambdas log a single JSON line per request via console.log(JSON.stringify(...)).
#   See plan doc §"Required upstream changes" for the producer-side spec.
# ============================================================

resource "aws_cloudwatch_log_metric_filter" "secrets_created" {
  name           = "secret-share-admin-${var.environment}-secrets-created"
  log_group_name = "${var.main_app_log_group_prefix}putItemFunction"

  # JSON metric filter — picks up only successful put-item events.
  pattern = "{ ($.handler = \"put-item\") && ($.outcome = \"ok\") }"

  metric_transformation {
    name          = "SecretsCreated"
    namespace     = local.ns
    value         = "1"
    default_value = "0"
    # Dimension by source so we can stack by web/slack/discord/canary on the dashboard.
    dimensions = {
      Source = "$.source"
    }
  }
}

resource "aws_cloudwatch_log_metric_filter" "secrets_retrieved" {
  name           = "secret-share-admin-${var.environment}-secrets-retrieved"
  log_group_name = "${var.main_app_log_group_prefix}getByIdFunction"

  pattern = "{ ($.handler = \"get-by-id\") && ($.outcome = \"ok\") }"

  metric_transformation {
    name          = "SecretsRetrieved"
    namespace     = local.ns
    value         = "1"
    default_value = "0"
  }
}

# ============================================================
#   Per-platform install filters — one filter per platform via for_each.
#   Adding a new platform = add a row to var.platforms (no code change here).
# ============================================================

resource "aws_cloudwatch_log_metric_filter" "platform_install" {
  for_each = local.install_filters

  name = "secret-share-admin-${var.environment}-${each.value.name}-install"
  # Each platform's oauth-callback Lambda log group. Pattern: "<prefix>oauth-callback-<env>".
  log_group_name = "${each.value.log_group_prefix}${each.value.install_handler}-${var.environment}"

  pattern = "{ ($.handler = \"${each.value.install_handler}\") && ($.outcome = \"ok\") }"

  metric_transformation {
    name          = "${title(each.value.name)}Installs" # SlackInstalls, DiscordInstalls, ...
    namespace     = local.ns
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "platform_uninstall" {
  for_each = local.uninstall_filters

  name           = "secret-share-admin-${var.environment}-${each.value.name}-uninstall"
  log_group_name = "${each.value.log_group_prefix}${each.value.uninstall_handler}-${var.environment}"

  pattern = "{ ($.handler = \"${each.value.uninstall_handler}\") && ($.event_type = \"${each.value.uninstall_event_type}\") }"

  metric_transformation {
    name          = "${title(each.value.name)}Uninstalls"
    namespace     = local.ns
    value         = "1"
    default_value = "0"
  }
}
