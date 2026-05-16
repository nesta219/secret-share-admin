# AWS Budgets — 2 free per account. We use both: a low warning at $25 and a
# louder one at $50. Routes to the same SNS topic so the slack-relay Lambda
# DMs Mike. Only deployed in production (no point watching dev costs separately
# when both envs share the same account).

resource "aws_budgets_budget" "monthly_warning" {
  count = var.environment == "production" ? 1 : 0

  name              = "secret-share-monthly-warning"
  budget_type       = "COST"
  limit_amount      = "25"
  limit_unit        = "USD"
  time_unit         = "MONTHLY"
  time_period_start = "2026-01-01_00:00"

  cost_filter {
    name   = "TagKeyValue"
    values = ["user:Project$secret-share-admin", "user:Project$secret-share", "user:Project$secret-share-slack", "user:Project$secret-share-discord"]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_sns_topic_arns  = [aws_sns_topic.alerts.arn]
  }
}

resource "aws_budgets_budget" "monthly_critical" {
  count = var.environment == "production" ? 1 : 0

  name              = "secret-share-monthly-critical"
  budget_type       = "COST"
  limit_amount      = "50"
  limit_unit        = "USD"
  time_unit         = "MONTHLY"
  time_period_start = "2026-01-01_00:00"

  cost_filter {
    name   = "TagKeyValue"
    values = ["user:Project$secret-share-admin", "user:Project$secret-share", "user:Project$secret-share-slack", "user:Project$secret-share-discord"]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_sns_topic_arns  = [aws_sns_topic.alerts.arn]
  }
}
