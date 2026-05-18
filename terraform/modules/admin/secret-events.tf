# The secret-share main app's secrets-table is owned by Serverless Framework
# in the other repo. We discover its DynamoDB Stream ARN at apply time via
# data source so we don't have to keep an env.hcl entry in sync with the
# auto-generated stream timestamp suffix.
data "aws_dynamodb_table" "secrets_main" {
  name = "secrets-table-${var.environment}"
}

# The Secrets tab's source of truth. Each row is one event in a secret's
# lifecycle: created (from a DDB stream INSERT), retrieved (REMOVE with a
# non-service userIdentity), or expired (REMOVE with userIdentity=Service
# meaning DynamoDB's TTL service did the deletion).
#
# Partitioned by UTC day so a single day's traffic shares one partition (low
# traffic = sparse and cheap). Sort key starts with the ISO timestamp so a
# Query with ScanIndexForward=false returns most-recent first.
#
# expires_at TTL auto-prunes rows older than 90 days. Storage cost is the
# only ongoing charge; reads + writes are PAY_PER_REQUEST and proportional
# to actual user traffic — no idle cost.
resource "aws_dynamodb_table" "secret_events" {
  name         = "secret-events-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }
  attribute {
    name = "sk"
    type = "S"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = var.environment == "production"
  }
}
