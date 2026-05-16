resource "aws_cognito_user_pool" "admin" {
  name = "secret-share-admin-${var.environment}"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  admin_create_user_config {
    allow_admin_create_user_only = true

    invite_message_template {
      email_subject = "send-a-secret admin (${var.environment}) — your temporary credentials"
      email_message = "An admin account has been provisioned for you at https://${var.admin_hostname}/\n\nUsername: {username}\nTemporary password: {####}\n\nYou will be asked to set a new password on first sign-in."
      sms_message   = "send-a-secret admin: username {username}, temp password {####}"
    }
  }

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = false
    temporary_password_validity_days = 7
  }

  mfa_configuration = "OPTIONAL"

  software_token_mfa_configuration {
    enabled = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
}

resource "aws_cognito_user_pool_client" "admin_spa" {
  name         = "secret-share-admin-spa-${var.environment}"
  user_pool_id = aws_cognito_user_pool.admin.id

  generate_secret = false

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["COGNITO"]

  callback_urls = var.cognito_callback_urls
  logout_urls   = var.cognito_logout_urls

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  prevent_user_existence_errors = "ENABLED"
}

resource "aws_cognito_user_pool_domain" "admin" {
  domain       = "secret-share-admin-${var.environment}"
  user_pool_id = aws_cognito_user_pool.admin.id
}
