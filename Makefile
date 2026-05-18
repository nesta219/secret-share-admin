SHELL := /usr/bin/env bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

ENV ?= dev
TG_DIR := terraform/environments/$(ENV)/admin
FE_DIR := frontend
BUCKET := secret-share-admin-static-$(ENV)
REGION := us-east-1

.PHONY: help install install-frontend build build-frontend test typecheck \
        tf-init tf-validate tf-plan plan \
        deploy-terraform deploy-frontend deploy destroy clean distclean \
        frontend-dev add-user

help:  ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?##' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "} {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

# ---------- Setup ----------

install: node_modules  ## npm install for backend
install-frontend: $(FE_DIR)/node_modules  ## npm install for frontend

node_modules: package.json
	npm install
	@touch node_modules

$(FE_DIR)/node_modules: $(FE_DIR)/package.json
	cd $(FE_DIR) && npm install
	@touch $(FE_DIR)/node_modules

# ---------- Build ----------

build: install  ## Bundle Lambda zips into dist/
	node scripts/build.mjs

build-frontend: install-frontend  ## Vite build into frontend/dist/
	cd $(FE_DIR) && npm run build

# ---------- Tests ----------

test: install  ## Run unit tests (vitest, no AWS)
	npm test

test-integration: install  ## Run integration tests against deployed admin in $(ENV). Mints a Cognito JWT and hits every route.
	@POOL_ID=$$(cd $(TG_DIR) && terragrunt output -raw cognito_user_pool_id) && \
	  CLIENT_ID=$$(cd $(TG_DIR) && terragrunt output -raw cognito_user_pool_client_id) && \
	  API_BASE=$$(cd $(TG_DIR) && terragrunt output -raw admin_url) && \
	  ADMIN_API_BASE=$$API_BASE COGNITO_USER_POOL_ID=$$POOL_ID COGNITO_CLIENT_ID=$$CLIENT_ID \
	    npm run test:integration

typecheck: install install-frontend  ## Type-check both backend and frontend
	npm run typecheck
	cd $(FE_DIR) && npm run typecheck

# ---------- Frontend dev ----------

frontend-dev: install-frontend  ## Run vite dev server on :3000 with /api proxy to dev API GW
	cd $(FE_DIR) && npm run dev

# ---------- Terragrunt ----------

tf-init:  ## terragrunt init for $(ENV)
	cd $(TG_DIR) && terragrunt init -input=false

tf-validate:  ## terragrunt validate for $(ENV)
	cd $(TG_DIR) && terragrunt validate

tf-plan: build  ## terragrunt plan for $(ENV) (builds Lambda zips first)
	cd $(TG_DIR) && terragrunt plan

plan: tf-plan  ## Full dry run for $(ENV)
	@echo "Dry run complete for ENV=$(ENV)."

# ---------- Deploy ----------

deploy-terraform: build  ## terragrunt apply for $(ENV) (builds Lambda zips first)
	cd $(TG_DIR) && terragrunt apply -auto-approve

deploy-frontend: build-frontend  ## Sync frontend/dist to S3 + invalidate CloudFront
	aws s3 sync $(FE_DIR)/dist/ s3://$(BUCKET)/ --delete --region $(REGION)
	@DIST_ID=$$(aws cloudfront list-distributions --query "DistributionList.Items[?Aliases.Items && contains(Aliases.Items, 'admin$(if $(filter dev,$(ENV)),-dev,)').send-a-secret.link)].Id | [0]" --output text); \
	  if [ -n "$$DIST_ID" ] && [ "$$DIST_ID" != "None" ]; then \
	    echo "Invalidating CloudFront distribution $$DIST_ID"; \
	    aws cloudfront create-invalidation --distribution-id $$DIST_ID --paths "/*" > /dev/null; \
	  fi

deploy: deploy-terraform deploy-frontend  ## Build + deploy backend + frontend
	@echo "Deploy complete for ENV=$(ENV)."

# ---------- Cognito helpers ----------

add-user: ## Add an admin user to the env's Cognito pool. Usage: make add-user EMAIL=foo@bar.com
	@if [ -z "$$EMAIL" ]; then echo "EMAIL=... required"; exit 1; fi
	@POOL_ID=$$(cd $(TG_DIR) && terragrunt output -raw cognito_user_pool_id); \
	  aws cognito-idp admin-create-user --user-pool-id $$POOL_ID --username $$EMAIL \
	    --user-attributes Name=email,Value=$$EMAIL Name=email_verified,Value=true \
	    --desired-delivery-mediums EMAIL --region $(REGION)

# ---------- Destroy ----------

destroy:  ## terragrunt destroy for $(ENV)
	cd $(TG_DIR) && terragrunt destroy -auto-approve

# ---------- Cleanup ----------

clean:  ## Remove build artifacts
	rm -rf dist .build $(FE_DIR)/dist

distclean: clean  ## clean + node_modules + terragrunt caches
	rm -rf node_modules $(FE_DIR)/node_modules
	find terraform -type d -name ".terragrunt-cache" -prune -exec rm -rf {} +
	find terraform -type d -name ".terraform" -prune -exec rm -rf {} +
