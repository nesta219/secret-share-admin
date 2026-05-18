locals {
  lambda_dist_dir = var.lambda_dist_dir

  # PLATFORMS_JSON env var consumed by src/lib/platforms.ts in the admin Lambda.
  # The Lambda uses this to generically scan each platform's install table,
  # apply per-platform field redaction, and shape the /api/admin/integrations response.
  platforms_json = jsonencode(var.platforms)

  # The slack-relay needs to look up bot tokens from the slack workspaces-table.
  # If no platform named "slack" is configured for this env, the relay falls back
  # to console.error only (its IAM omits the DDB grant — see iam.tf).
  slack_platform        = try([for p in var.platforms : p if p.name == "slack"][0], null)
  slack_table_name      = local.slack_platform == null ? "" : local.slack_platform.table_name
  slack_table_arn       = local.slack_platform == null ? "" : local.slack_platform.table_arn
  slack_relay_deployable = local.slack_platform != null && var.alert_target_team_id != ""
}

# ============================================================
#                    admin (monolithic API Lambda)
# ============================================================

resource "aws_cloudwatch_log_group" "admin" {
  name              = "/aws/lambda/secret-share-admin-${var.environment}"
  retention_in_days = var.lambda_log_retention_days
}

resource "aws_lambda_function" "admin" {
  function_name = "secret-share-admin-${var.environment}"
  role          = aws_iam_role.admin.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  # 256MB shaves ~200ms off cold start vs 128MB; CWL Insights + DDB scans benefit
  # from the extra CPU. Still inside the always-free Lambda compute envelope at
  # admin-only traffic levels.
  memory_size = 256
  # 10s is enough for one round-trip Insights poll. Long queries return queryId
  # for the SPA to resume in a follow-up call.
  timeout = 10

  filename         = "${local.lambda_dist_dir}/admin.zip"
  source_code_hash = filebase64sha256("${local.lambda_dist_dir}/admin.zip")

  tracing_config {
    mode = "Active"
  }

  environment {
    variables = {
      ENVIRONMENT               = var.environment
      PLATFORMS_JSON            = local.platforms_json
      MAIN_APP_LOG_GROUP_PREFIX = var.main_app_log_group_prefix
      METRIC_NAMESPACE          = "${var.metric_namespace}/${var.environment}"
      COGNITO_USER_POOL_ID      = aws_cognito_user_pool.admin.id
      COGNITO_CLIENT_ID         = aws_cognito_user_pool_client.admin_spa.id
      SECRET_EVENTS_TABLE       = aws_dynamodb_table.secret_events.name
      # Comma-separated log group prefixes the Insights query spans. Maintained
      # by Terraform so the Lambda doesn't have to re-derive it from PLATFORMS_JSON.
      LOG_GROUP_PREFIXES = join(",", concat(
        [var.main_app_log_group_prefix, "/aws/lambda/secret-share-admin-${var.environment}"],
        [for p in var.platforms : p.log_group_prefix],
      ))
    }
  }

  depends_on = [aws_cloudwatch_log_group.admin]
}

# ============================================================
#                    canary (synthetic monitor)
# ============================================================

resource "aws_cloudwatch_log_group" "canary" {
  name              = "/aws/lambda/secret-share-admin-canary-${var.environment}"
  retention_in_days = var.lambda_log_retention_days
}

resource "aws_lambda_function" "canary" {
  function_name = "secret-share-admin-canary-${var.environment}"
  role          = aws_iam_role.canary.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  memory_size   = 128
  timeout       = 25

  filename         = "${local.lambda_dist_dir}/canary.zip"
  source_code_hash = filebase64sha256("${local.lambda_dist_dir}/canary.zip")

  environment {
    variables = {
      ENVIRONMENT           = var.environment
      SECRET_SHARE_API_BASE = var.secret_share_api_base
      METRIC_NAMESPACE      = "${var.metric_namespace}/${var.environment}"
      CANARY_METRIC_NAME    = "CanarySuccess"
    }
  }

  depends_on = [aws_cloudwatch_log_group.canary]
}

# ============================================================
#                    slack-relay (alarm DM dispatcher)
# ============================================================

# ============================================================
#       secret-events-fanout (DynamoDB stream consumer)
# ============================================================
#
# Triggered by the secrets-table DynamoDB stream. Writes one row per event
# to the secret-events table for the admin's Secrets tab. No schedule, no
# idle cost — invocations are 1:1 with secret create / retrieve / expire
# events on the main app.

resource "aws_cloudwatch_log_group" "secret_events_fanout" {
  name              = "/aws/lambda/secret-share-admin-secret-events-fanout-${var.environment}"
  retention_in_days = var.lambda_log_retention_days
}

resource "aws_lambda_function" "secret_events_fanout" {
  function_name = "secret-share-admin-secret-events-fanout-${var.environment}"
  role          = aws_iam_role.secret_events_fanout.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  memory_size   = 128
  timeout       = 30 # generous; batch size ≤ 100 but usually 1-2

  filename         = "${local.lambda_dist_dir}/secret-events-fanout.zip"
  source_code_hash = filebase64sha256("${local.lambda_dist_dir}/secret-events-fanout.zip")

  environment {
    variables = {
      ENVIRONMENT          = var.environment
      SECRET_EVENTS_TABLE  = aws_dynamodb_table.secret_events.name
      EVENT_RETENTION_DAYS = "90"
    }
  }

  depends_on = [aws_cloudwatch_log_group.secret_events_fanout]
}

resource "aws_lambda_event_source_mapping" "secrets_stream" {
  event_source_arn  = data.aws_dynamodb_table.secrets_main.stream_arn
  function_name     = aws_lambda_function.secret_events_fanout.arn
  starting_position = "LATEST" # don't replay history at first hookup
  batch_size        = 100
  # Bisect on failure so a single bad record doesn't poison the whole batch
  # and stall the stream. On_failure goes to nothing — the fanout writes its
  # own error logs and the main app's data is unaffected by fanout failures.
  bisect_batch_on_function_error = true
  maximum_retry_attempts         = 3

  filter_criteria {
    # Skip MODIFY events — secrets-table rows are immutable; only INSERT and
    # REMOVE carry signal for the Secrets tab.
    filter {
      pattern = jsonencode({ eventName = ["INSERT", "REMOVE"] })
    }
  }
}

# ============================================================
#                    slack-relay (alarm DM dispatcher)
# ============================================================

resource "aws_cloudwatch_log_group" "slack_relay" {
  count             = local.slack_relay_deployable ? 1 : 0
  name              = "/aws/lambda/secret-share-admin-slack-relay-${var.environment}"
  retention_in_days = var.lambda_log_retention_days
}

resource "aws_lambda_function" "slack_relay" {
  count         = local.slack_relay_deployable ? 1 : 0
  function_name = "secret-share-admin-slack-relay-${var.environment}"
  role          = aws_iam_role.slack_relay[0].arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  memory_size   = 128
  timeout       = 10

  filename         = "${local.lambda_dist_dir}/slack-relay.zip"
  source_code_hash = filebase64sha256("${local.lambda_dist_dir}/slack-relay.zip")

  environment {
    variables = {
      ENVIRONMENT          = var.environment
      WORKSPACES_TABLE     = local.slack_table_name
      ALERT_TARGET_TEAM_ID = var.alert_target_team_id
    }
  }

  depends_on = [aws_cloudwatch_log_group.slack_relay]
}
