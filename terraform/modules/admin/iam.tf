locals {
  # Only deployed platforms get IAM grants. Granting on a non-existent table ARN
  # is harmless (IAM doesn't validate resource existence) but cluttering, and the
  # log-group grant would fail if we tried to scope to a non-existent log group.
  deployed_platforms = [for p in var.platforms : p if p.deployed]

  platform_table_arns = [for p in local.deployed_platforms : p.table_arn]

  insights_log_group_arns = concat(
    [
      "arn:aws:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/secret-share-admin-${var.environment}:*",
      "arn:aws:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:${var.main_app_log_group_prefix}*:*",
    ],
    [for p in local.deployed_platforms : "arn:aws:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:${p.log_group_prefix}*:*"],
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
  # `Start/Get/StopQuery` accept resource-level ARNs (scoped to our chosen log groups).
  statement {
    sid = "LogsInsightsQuery"
    actions = [
      "logs:StartQuery",
      "logs:GetQueryResults",
      "logs:StopQuery",
    ]
    resources = local.insights_log_group_arns
  }

  # `DescribeLogGroups` and `DescribeQueries` don't support resource-level IAM
  # in CloudWatch Logs — the action returns a list and IAM has no item to
  # match against pre-evaluation. AWS rejects scoped ARNs with an authorization
  # error. Resource: * is the only valid form.
  statement {
    sid       = "LogsDescribe"
    actions   = ["logs:DescribeLogGroups", "logs:DescribeQueries"]
    resources = ["*"]
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
