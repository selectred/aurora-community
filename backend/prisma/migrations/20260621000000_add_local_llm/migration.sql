-- Add local/OpenAI-compatible LLM provider fields
ALTER TABLE "AppSettings" ADD COLUMN "localLlmEndpoint" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AppSettings" ADD COLUMN "localLlmModel"    TEXT NOT NULL DEFAULT '';
ALTER TABLE "AppSettings" ADD COLUMN "localLlmApiKey"   TEXT NOT NULL DEFAULT '';
