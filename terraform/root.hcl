locals {
  env_vars    = read_terragrunt_config(find_in_parent_folders("env.hcl"))
  environment = local.env_vars.locals.environment
  aws_region  = local.env_vars.locals.aws_region
  account_id  = local.env_vars.locals.account_id
  project     = local.env_vars.locals.project
}

remote_state {
  backend = "s3"
  generate = {
    path      = "backend.tf"
    if_exists = "overwrite_terragrunt"
  }
  config = {
    bucket         = "nesta-terraform-backend"
    key            = "${local.project}/${local.environment}/terraform.tfstate"
    region         = local.aws_region
    encrypt        = true
    dynamodb_table = "nesta-terraform-locks"
  }
}

generate "provider" {
  path      = "provider.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<EOF
terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "${local.aws_region}"

  default_tags {
    tags = {
      Project     = "${local.project}"
      Environment = "${local.environment}"
      ManagedBy   = "terragrunt"
    }
  }
}
EOF
}
