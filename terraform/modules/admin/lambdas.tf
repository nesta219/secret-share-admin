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
