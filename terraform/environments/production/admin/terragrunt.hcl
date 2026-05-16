include "root" {
  path = find_in_parent_folders("root.hcl")
}

terraform {
  source = "${get_repo_root()}/terraform/modules/admin"
}

locals {
  env = read_terragrunt_config(find_in_parent_folders("env.hcl"))
}

inputs = {
  region                    = local.env.locals.aws_region
  environment               = local.env.locals.environment
  admin_hostname            = local.env.locals.admin_hostname
  hosted_zone_id            = local.env.locals.hosted_zone_id
  acm_cert_arn              = local.env.locals.acm_cert_arn
  cognito_callback_urls     = local.env.locals.cognito_callback_urls
  cognito_logout_urls       = local.env.locals.cognito_logout_urls
  secret_share_api_base     = local.env.locals.secret_share_api_base
  main_app_log_group_prefix = local.env.locals.main_app_log_group_prefix
  alert_target_team_id      = local.env.locals.alert_target_team_id
  platforms                 = local.env.locals.platforms
  lambda_dist_dir           = "${get_repo_root()}/dist"
}
