variable "region" {
  type    = string
  default = "us-east-1"
}

variable "environment" {
  type = string
}

variable "admin_hostname" {
  type        = string
  description = "Public hostname the SPA is served from (e.g. admin-dev.send-a-secret.link)."
}

variable "hosted_zone_id" {
  type        = string
  description = "Route53 hosted zone ID for send-a-secret.link (shared, owned by the main repo)."
}

variable "acm_cert_arn" {
  type        = string
  description = "ARN of the pre-existing wildcard SAN cert for *.send-a-secret.link (us-east-1)."
}

variable "cognito_callback_urls" {
  type        = list(string)
  description = "Allowed OAuth callback URLs for the Cognito hosted UI (includes localhost for dev)."
}

variable "cognito_logout_urls" {
  type        = list(string)
  description = "Allowed sign-out redirect URLs for the Cognito hosted UI."
}

variable "secret_share_api_base" {
  type        = string
  description = "Main secret-share API base URL — used by the synthetic canary to exercise put+get."
}

variable "main_app_log_group_prefix" {
  type        = string
  description = "Log group prefix for the main secret-share Lambdas (e.g. /aws/lambda/secret-share-backend-dev-)."
}

variable "alert_target_team_id" {
  type        = string
  description = "Slack team_id whose bot token the slack-relay Lambda will use to DM alerts. Empty = console.error fallback only."
  default     = ""
}

variable "platforms" {
  description = "Platform integrations this admin reads from. Adding a row wires up IAM, metric filters, and alarms automatically. See env.hcl for field meanings."
  type = list(object({
    name                 = string
    display_name         = string
    table_name           = string
    table_arn            = string
    hash_key             = string
    display_name_field   = string
    type_discriminator   = string
    safe_fields          = list(string)
    sensitive_fields     = list(string)
    log_group_prefix     = string
    install_handler      = string
    uninstall_handler    = string
    uninstall_event_type = string
  }))
}

variable "lambda_dist_dir" {
  type        = string
  description = "Absolute path to the dist/ directory containing built Lambda zips (admin.zip, canary.zip, slack-relay.zip)."
}

# ---------- Tunables with sensible defaults ----------

variable "lambda_log_retention_days" {
  type        = number
  default     = 30
  description = "Retention for admin/canary/slack-relay log groups. Longer than the platform repos (14d) because admin is the observability platform."
}

variable "canary_schedule" {
  type        = string
  default     = "rate(5 minutes)"
  description = "EventBridge schedule for the synthetic canary."
}

variable "metric_namespace" {
  type        = string
  default     = "SecretShare"
  description = "CloudWatch metric namespace for filter-derived counts and the canary metric."
}

variable "static_file_min_ttl" {
  type    = number
  default = 0
}

variable "static_file_default_ttl" {
  type    = number
  default = 0
}

variable "static_file_max_ttl" {
  type    = number
  default = 0
}

data "aws_caller_identity" "current" {}
