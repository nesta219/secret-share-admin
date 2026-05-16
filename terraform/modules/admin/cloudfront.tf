locals {
  s3_origin_id  = "admin_s3_origin"
  api_origin_id = "admin_api_origin"

  # The HTTP API regional invoke URL is https://<api-id>.execute-api.<region>.amazonaws.com.
  # CloudFront wants the bare hostname (no scheme), so strip it.
  api_origin_domain = replace(aws_apigatewayv2_api.admin.api_endpoint, "https://", "")
}

resource "aws_cloudfront_distribution" "spa" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  aliases             = [var.admin_hostname]
  comment             = "secret-share-admin SPA (${var.environment})"
  price_class         = "PriceClass_100" # NA + EU only — keeps cost down

  origin {
    domain_name = aws_s3_bucket.spa.bucket_regional_domain_name
    origin_id   = local.s3_origin_id

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.spa.cloudfront_access_identity_path
    }
  }

  origin {
    domain_name = local.api_origin_domain
    origin_id   = local.api_origin_id

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = local.s3_origin_id

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = var.static_file_min_ttl
    default_ttl            = var.static_file_default_ttl
    max_ttl                = var.static_file_max_ttl
    compress               = true
  }

  ordered_cache_behavior {
    path_pattern     = "/api/*"
    allowed_methods  = ["HEAD", "DELETE", "POST", "GET", "OPTIONS", "PUT", "PATCH"]
    cached_methods   = ["GET", "HEAD", "OPTIONS"]
    target_origin_id = local.api_origin_id

    forwarded_values {
      query_string = true
      # Authorization MUST be forwarded so the JWT authorizer on API Gateway can validate it.
      # Origin + Content-Type cover normal browser fetches.
      headers = ["Authorization", "Origin", "Content-Type"]

      cookies {
        forward = "none"
      }
    }

    min_ttl                = 0
    default_ttl            = 0
    max_ttl                = 0
    compress               = true
    viewer_protocol_policy = "redirect-to-https"
  }

  # SPA client-side routing: any non-existent path serves index.html so React Router can handle it.
  custom_error_response {
    error_caching_min_ttl = 0
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
  }

  custom_error_response {
    error_caching_min_ttl = 0
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
  }

  viewer_certificate {
    acm_certificate_arn = var.acm_cert_arn
    ssl_support_method  = "sni-only"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
}
