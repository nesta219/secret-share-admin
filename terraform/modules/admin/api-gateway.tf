resource "aws_apigatewayv2_api" "admin" {
  name          = "secret-share-admin-${var.environment}"
  protocol_type = "HTTP"
  description   = "Admin API for secret-share (${var.environment})"

  cors_configuration {
    # CORS is mostly handled by CloudFront serving the SPA from the same origin
    # (no cross-origin browser request), but we keep an open dev allow for the
    # local vite dev server.
    allow_origins = concat(
      ["https://${var.admin_hostname}"],
      var.environment == "dev" ? ["http://localhost:3000"] : [],
    )
    allow_methods = ["GET", "OPTIONS"]
    allow_headers = ["authorization", "content-type"]
    max_age       = 300
  }
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.admin.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_access.arn
    format = jsonencode({
      requestId          = "$context.requestId"
      ip                 = "$context.identity.sourceIp"
      requestTime        = "$context.requestTime"
      httpMethod         = "$context.httpMethod"
      routeKey           = "$context.routeKey"
      status             = "$context.status"
      protocol           = "$context.protocol"
      responseLength     = "$context.responseLength"
      integrationStatus  = "$context.integrationStatus"
      integrationLatency = "$context.integrationLatency"
      authorizer         = "$context.authorizer.error"
    })
  }
}

resource "aws_cloudwatch_log_group" "api_access" {
  name              = "/aws/apigateway/secret-share-admin-${var.environment}"
  retention_in_days = 14
}

# ---------- JWT authorizer (Cognito-backed, native to HTTP API v2) ----------
#
# HTTP API v2 validates the JWT at the gateway — no Lambda authorizer needed.
# The SPA sends `Authorization: Bearer <id_token>`. API Gateway verifies:
#   - signature against Cognito's JWKS
#   - `iss` matches the user pool
#   - `aud` matches the SPA client_id
#   - `exp` not in the past
# On success, claims are placed at $request.authorizer.jwt.claims (passed
# through to the Lambda at event.requestContext.authorizer.jwt.claims).

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.admin.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "cognito-${var.environment}"

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.admin_spa.id]
    issuer   = "https://cognito-idp.${var.region}.amazonaws.com/${aws_cognito_user_pool.admin.id}"
  }
}

# ---------- Single integration → admin Lambda ----------

resource "aws_apigatewayv2_integration" "admin" {
  api_id                 = aws_apigatewayv2_api.admin.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.admin.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

# ---------- Single greedy authenticated route ----------

resource "aws_apigatewayv2_route" "admin_proxy" {
  api_id             = aws_apigatewayv2_api.admin.id
  route_key          = "ANY /api/admin/{proxy+}"
  target             = "integrations/${aws_apigatewayv2_integration.admin.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_lambda_permission" "api_gateway_invoke" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.admin.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.admin.execution_arn}/*/*"
}
