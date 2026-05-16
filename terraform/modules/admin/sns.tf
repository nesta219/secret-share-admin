resource "aws_sns_topic" "alerts" {
  name = "secret-share-admin-alerts-${var.environment}"
}

# Subscribe the slack-relay Lambda if it was provisioned (i.e. slack platform
# exists in this env AND alert_target_team_id is set).
resource "aws_sns_topic_subscription" "alerts_to_slack_relay" {
  count     = local.slack_relay_deployable ? 1 : 0
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.slack_relay[0].arn
}

resource "aws_lambda_permission" "sns_invoke_slack_relay" {
  count         = local.slack_relay_deployable ? 1 : 0
  statement_id  = "AllowSNSInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.slack_relay[0].function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.alerts.arn
}
