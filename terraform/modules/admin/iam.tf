locals {
  # Every platform's install table (so admin can Scan/Query them).
  platform_table_arns = [for p in var.platforms : p.table_arn]

  # CloudWatch Logs ARNs covering: admin's own logs + main app logs + each platform's logs.
  # Insights query operations (StartQuery, GetQueryResults, etc.) accept the log group
  # identifiers up-front; the resource ARN scoping ensures the IAM allow is narrow.
  insights_log_group_arns = concat(
    [
      "arn:aws:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/secret-share-admin-${var.environment}:*",
      "arn:aws:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:${var.main_app_log_group_prefix}*:*",
    ],
    [for p in var.platforms : "arn:aws:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:${p.log_group_prefix}*:*"],
  )
}

# ============================================================
#                    admin role
# ============================================================

data "aws_iam_policy_document" "admin_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "admin" {
  name               = "secret-share-admin-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.admin_assume.json
}

resource "aws_iam_role_policy_attachment" "admin_basic_execution" {
  role       = aws_iam_role.admin.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "admin_xray" {
  role       = aws_iam_role.admin.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

data "aws_iam_policy_document" "admin_app" {
  # Scan/Query each platform's install table. Sensitive fields (bot_token etc.) are
  # never returned by the Lambda — see src/routes/installs.ts which projects to safe_fields.
  statement {
    sid       = "DdbReadPlatformTables"
    actions   = ["dynamodb:Scan", "dynamodb:Query", "dynamodb:DescribeTable"]
    resources = local.platform_table_arns
  }

  # CloudWatch Logs Insights against admin's own + main app + every platform's log groups.
  statement {
    sid = "LogsInsights"
    actions = [
      "logs:StartQuery",
      "logs:GetQueryResults",
      "logs:StopQuery",
      "logs:DescribeQueries",
      "logs:DescribeLogGroups",
    ]
    resources = local.insights_log_group_arns
  }

  # GetMetricData / GetMetricStatistics are unfortunately resource-level-unsupported
  # operations — they only accept `Resource: "*"`. We narrow via the namespace
  # filter on the dashboard/stats route rather than IAM.
  statement {
    sid       = "ReadCloudWatchMetrics"
    actions   = ["cloudwatch:GetMetricData", "cloudwatch:GetMetricStatistics", "cloudwatch:ListMetrics"]
    resources = ["*"]
  }

  # Alarm/canary status surfaces in /api/admin/health.
  statement {
    sid       = "ReadAlarms"
    actions   = ["cloudwatch:DescribeAlarms", "cloudwatch:DescribeAlarmHistory"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "admin_app" {
  name   = "secret-share-admin-app-${var.environment}"
  role   = aws_iam_role.admin.id
  policy = data.aws_iam_policy_document.admin_app.json
}

# ============================================================
#                    canary role
# ============================================================

data "aws_iam_policy_document" "canary_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "canary" {
  name               = "secret-share-admin-canary-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.canary_assume.json
}

resource "aws_iam_role_policy_attachment" "canary_basic_execution" {
  role       = aws_iam_role.canary.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "canary_metrics" {
  statement {
    sid       = "PutCanaryMetric"
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"] # PutMetricData doesn't support resource-level perms; namespace condition narrows it.

    condition {
      test     = "StringEquals"
      variable = "cloudwatch:namespace"
      values   = ["${var.metric_namespace}/${var.environment}"]
    }
  }
}

resource "aws_iam_role_policy" "canary_metrics" {
  name   = "secret-share-admin-canary-metrics-${var.environment}"
  role   = aws_iam_role.canary.id
  policy = data.aws_iam_policy_document.canary_metrics.json
}

# ============================================================
#                    slack-relay role
# ============================================================

data "aws_iam_policy_document" "slack_relay_assume" {
  count = local.slack_relay_deployable ? 1 : 0
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "slack_relay" {
  count              = local.slack_relay_deployable ? 1 : 0
  name               = "secret-share-admin-slack-relay-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.slack_relay_assume[0].json
}

resource "aws_iam_role_policy_attachment" "slack_relay_basic_execution" {
  count      = local.slack_relay_deployable ? 1 : 0
  role       = aws_iam_role.slack_relay[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "slack_relay_ddb" {
  count = local.slack_relay_deployable ? 1 : 0
  statement {
    sid       = "ReadAlertTargetWorkspace"
    actions   = ["dynamodb:GetItem"]
    resources = [local.slack_table_arn]

    # Lock it down to ONLY the alert target team's row — the relay should not
    # be a generic bot-token reader.
    condition {
      test     = "ForAllValues:StringEquals"
      variable = "dynamodb:LeadingKeys"
      values   = [var.alert_target_team_id]
    }
  }
}

resource "aws_iam_role_policy" "slack_relay_ddb" {
  count  = local.slack_relay_deployable ? 1 : 0
  name   = "secret-share-admin-slack-relay-ddb-${var.environment}"
  role   = aws_iam_role.slack_relay[0].id
  policy = data.aws_iam_policy_document.slack_relay_ddb[0].json
}
