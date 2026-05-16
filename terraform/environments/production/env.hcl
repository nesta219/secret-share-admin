locals {
  base = read_terragrunt_config(find_in_parent_folders("_env/env.hcl"))

  project    = local.base.locals.project
  aws_region = local.base.locals.aws_region
  account_id = local.base.locals.account_id

  environment = "production"

  admin_hostname = "admin.send-a-secret.link"
  hosted_zone_id = "Z06715072NF77XVGMB1AG" # send-a-secret.link

  acm_cert_arn = "arn:aws:acm:us-east-1:081823476824:certificate/d9fbe85b-92c8-4507-bf1d-aaa398224862"

  cognito_callback_urls = [
    "https://admin.send-a-secret.link/auth/callback",
  ]
  cognito_logout_urls = [
    "https://admin.send-a-secret.link/",
  ]

  secret_share_api_base     = "https://nzh6axfmp7.execute-api.us-east-1.amazonaws.com/production"
  main_app_log_group_prefix = "/aws/lambda/secret-share-backend-production-"

  alert_target_team_id = ""

  platforms = [
    {
      name                 = "slack"
      display_name         = "Slack"
      table_name           = "workspaces-table-production"
      table_arn            = "arn:aws:dynamodb:us-east-1:081823476824:table/workspaces-table-production"
      hash_key             = "team_id"
      display_name_field   = "team_name"
      type_discriminator   = ""
      safe_fields          = ["team_id", "team_name", "installed_at", "plan", "installer_user_id", "bot_user_id"]
      sensitive_fields     = ["bot_token"]
      log_group_prefix     = "/aws/lambda/slack-app-"
      install_handler      = "oauth-callback"
      uninstall_handler    = "events"
      uninstall_event_type = "app_uninstalled"
    },
    {
      name                 = "discord"
      display_name         = "Discord"
      table_name           = "installs-table-production"
      table_arn            = "arn:aws:dynamodb:us-east-1:081823476824:table/installs-table-production"
      hash_key             = "install_id"
      display_name_field   = "guild_name"
      type_discriminator   = "install_type"
      safe_fields          = ["install_id", "install_type", "guild_name", "installed_at", "plan", "installer_user_id", "bot_user_id"]
      sensitive_fields     = []
      log_group_prefix     = "/aws/lambda/discord-app-"
      install_handler      = "oauth-callback"
      uninstall_handler    = ""
      uninstall_event_type = ""
    },
  ]
}
