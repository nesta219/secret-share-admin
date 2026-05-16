output "admin_url" {
  description = "Public URL of the admin SPA."
  value       = "https://${var.admin_hostname}"
}

output "cognito_user_pool_id" {
  description = "Cognito user pool ID — used by `make add-user` to provision admin accounts."
  value       = aws_cognito_user_pool.admin.id
}

output "cognito_user_pool_client_id" {
  description = "Cognito SPA client ID — set as VITE_COGNITO_CLIENT_ID in the frontend build."
  value       = aws_cognito_user_pool_client.admin_spa.id
}

output "cognito_hosted_ui_domain" {
  description = "Cognito hosted-UI domain — set as VITE_COGNITO_DOMAIN in the frontend build."
  value       = "${aws_cognito_user_pool_domain.admin.domain}.auth.${var.region}.amazoncognito.com"
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID — used by `make deploy-frontend` to invalidate cache."
  value       = aws_cloudfront_distribution.spa.id
}

output "spa_bucket_name" {
  description = "S3 bucket holding the SPA build output."
  value       = aws_s3_bucket.spa.id
}

output "admin_api_invoke_url" {
  description = "API Gateway invoke URL — used as the CloudFront /api/* origin (already wired)."
  value       = aws_apigatewayv2_api.admin.api_endpoint
}

output "alerts_sns_topic_arn" {
  description = "SNS topic that alarms publish to."
  value       = aws_sns_topic.alerts.arn
}
