resource "aws_route53_record" "spa_alias" {
  name    = var.admin_hostname
  zone_id = var.hosted_zone_id
  type    = "A"

  alias {
    evaluate_target_health = false
    name                   = aws_cloudfront_distribution.spa.domain_name
    zone_id                = aws_cloudfront_distribution.spa.hosted_zone_id
  }
}
