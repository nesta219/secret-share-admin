resource "aws_s3_bucket" "spa" {
  bucket = "secret-share-admin-static-${var.environment}"
}

resource "aws_cloudfront_origin_access_identity" "spa" {
  comment = "secret-share-admin SPA bucket (${var.environment})"
}

data "aws_iam_policy_document" "spa" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.spa.arn}/*"]

    principals {
      type        = "AWS"
      identifiers = [aws_cloudfront_origin_access_identity.spa.iam_arn]
    }
  }
}

resource "aws_s3_bucket_policy" "spa" {
  bucket = aws_s3_bucket.spa.id
  policy = data.aws_iam_policy_document.spa.json
}
