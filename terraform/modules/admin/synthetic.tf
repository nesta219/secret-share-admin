resource "aws_cloudwatch_event_rule" "canary_schedule" {
  name                = "secret-share-admin-canary-${var.environment}"
  description         = "Fires the synthetic canary every ${var.canary_schedule}"
  schedule_expression = var.canary_schedule
}

resource "aws_cloudwatch_event_target" "canary_target" {
  rule = aws_cloudwatch_event_rule.canary_schedule.name
  arn  = aws_lambda_function.canary.arn
}

resource "aws_lambda_permission" "canary_eventbridge_invoke" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.canary.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.canary_schedule.arn
}
