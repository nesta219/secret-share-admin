locals {
  # One metric per platform's installs, stacked on the same widget.
  platform_install_metrics = [
    for p in var.platforms : [local.ns, "${title(p.name)}Installs"]
  ]

  dashboard_body = jsonencode({
    widgets = [
      # Row 1: business metrics (the only widgets you'll actually look at daily)
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Secrets created vs retrieved (24h)"
          region = var.region
          view   = "timeSeries"
          stat   = "Sum"
          period = 300
          metrics = [
            [local.ns, "SecretsCreated"],
            [local.ns, "SecretsRetrieved"],
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Installs by platform (24h)"
          region = var.region
          view   = "timeSeries"
          stat   = "Sum"
          period = 300
          metrics = local.platform_install_metrics
        }
      },

      # Row 2: canary
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 24
        height = 4
        properties = {
          title  = "Synthetic canary (put+get round-trip every 5 min)"
          region = var.region
          view   = "timeSeries"
          stat   = "Minimum"
          period = 300
          yAxis = {
            left = {
              min = 0
              max = 1
            }
          }
          metrics = [
            [local.ns, "CanarySuccess"],
          ]
        }
      },

      # Row 3: Lambda health (admin + main + per-platform install handlers)
      {
        type   = "metric"
        x      = 0
        y      = 10
        width  = 12
        height = 6
        properties = {
          title  = "Lambda errors"
          region = var.region
          view   = "timeSeries"
          stat   = "Sum"
          period = 300
          metrics = concat(
            [
              ["AWS/Lambda", "Errors", "FunctionName", aws_lambda_function.admin.function_name],
              ["AWS/Lambda", "Errors", "FunctionName", "secret-share-backend-${var.environment}-putItemFunction"],
              ["AWS/Lambda", "Errors", "FunctionName", "secret-share-backend-${var.environment}-getByIdFunction"],
            ],
            [for p in var.platforms : ["AWS/Lambda", "Errors", "FunctionName", "${p.name}-app-${p.install_handler}-${var.environment}"]],
          )
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 10
        width  = 12
        height = 6
        properties = {
          title  = "Lambda duration p99 (ms)"
          region = var.region
          view   = "timeSeries"
          stat   = "p99"
          period = 300
          metrics = [
            ["AWS/Lambda", "Duration", "FunctionName", aws_lambda_function.admin.function_name],
            ["AWS/Lambda", "Duration", "FunctionName", "secret-share-backend-${var.environment}-putItemFunction"],
            ["AWS/Lambda", "Duration", "FunctionName", "secret-share-backend-${var.environment}-getByIdFunction"],
          ]
        }
      },

      # Row 4: API Gateway
      {
        type   = "metric"
        x      = 0
        y      = 16
        width  = 24
        height = 6
        properties = {
          title  = "Admin API Gateway requests + errors"
          region = var.region
          view   = "timeSeries"
          stat   = "Sum"
          period = 300
          metrics = [
            ["AWS/ApiGateway", "Count", "ApiId", aws_apigatewayv2_api.admin.id, "Stage", aws_apigatewayv2_stage.default.name],
            ["AWS/ApiGateway", "4xx", "ApiId", aws_apigatewayv2_api.admin.id, "Stage", aws_apigatewayv2_stage.default.name],
            ["AWS/ApiGateway", "5xx", "ApiId", aws_apigatewayv2_api.admin.id, "Stage", aws_apigatewayv2_stage.default.name],
          ]
        }
      },
    ]
  })
}

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "secret-share-admin-${var.environment}"
  dashboard_body = local.dashboard_body
}
