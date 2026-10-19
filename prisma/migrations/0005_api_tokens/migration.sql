-- Personal access tokens for the Typle API. Only the SHA-256 of a token is kept, never the token itself.
CREATE TABLE "typle_api_tokens" (
    "token_id" UUID NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),

    CONSTRAINT "typle_api_tokens_pkey" PRIMARY KEY ("token_id"),
    CONSTRAINT "typle_api_tokens_scope_check" CHECK ("scope" IN ('read', 'write'))
);

CREATE UNIQUE INDEX "typle_api_tokens_token_hash_key" ON "typle_api_tokens"("token_hash");

CREATE INDEX "typle_api_tokens_owner_id_idx" ON "typle_api_tokens"("owner_id");
