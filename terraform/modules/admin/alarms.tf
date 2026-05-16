locals {
  # Per-platform "OAuth callback errors" alarms — one per platform via for_each.
  oauth_alarm_targets = {
    for p in var.platforms : p.name => p
  }
}

# ============================================================
#                    admin Lambda health
# ============================================================

resource "aws_cloudwatch_metric_alarm" "admin_errors" {
  alarm_name          = "secret-share-admin-${var.environment}-admin-errors"
  alarm_description   = "admin Lambda is throwing — the dashboard is broken or its dependencies are unreachable"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.admin.function_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "admin_duration_p99" {
  alarm_name          = "secret-share-admin-${var.environment}-admin-duration-p99"
  alarm_description   = "admin Lambda p99 latency > 5s — likely a slow Insights query or DDB scan; check route timing"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = 300
  extended_statistic  = "p99"
  threshold           = 5000
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.admin.function_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# ============================================================
#                    API Gateway 5xx
# ============================================================

resource "aws_cloudwatch_metric_alarm" "admin_api_5xx" {
  alarm_name          = "secret-share-admin-${var.environment}-api-5xx"
  alarm_description   = "Admin API Gateway is returning 5xx — auth misconfig, integration failure, or downstream blowup"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "5xx"
  namespace           = "AWS/ApiGateway"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  treat_missing_data  = "notBreaching"

  dimensions = {
    ApiId = aws_apigatewayv2_api.admin.id
    Stage = aws_apigatewayv2_stage.default.name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# ============================================================
#                    Canary (the cheapest deep-failure detector)
# ============================================================

resource "aws_cloudwatch_metric_alarm" "canary_failure" {
  alarm_name          = "secret-share-admin-${var.environment}-canary-failure"
  alarm_description   = "Synthetic put+get round-trip against the main secret-share API has failed for 2 consecutive 5-min windows"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  metric_name         = "CanarySuccess"
  namespace           = "${var.metric_namespace}/${var.environment}"
  period              = 300
  statistic           = "Maximum"
  threshold           = 1
  treat_missing_data  = "breaching" # missing canary = canary itself broken = alarm

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# ============================================================
#                    Main app secret-create errors
# ============================================================

resource "aws_cloudwatch_metric_alarm" "main_put_errors" {
  alarm_name          = "secret-share-admin-${var.environment}-main-put-errors"
  alarm_description   = "Main secret-share put-item Lambda is failing — users cannot create secrets"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = "secret-share-backend-${var.environment}-putItemFunction"
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# ============================================================
#                    Per-platform OAuth callback errors
#                    (one alarm per platform via for_each)
# ============================================================

resource "aws_cloudwatch_metric_alarm" "platform_oauth_errors" {
  for_each = local.oauth_alarm_targets

  alarm_name          = "secret-share-admin-${var.environment}-${each.value.name}-oauth-errors"
  alarm_description   = "${each.value.display_name} OAuth callback is failing — install flow is broken"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = "${each.value.name}-app-${each.value.install_handler}-${var.environment}"
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}
