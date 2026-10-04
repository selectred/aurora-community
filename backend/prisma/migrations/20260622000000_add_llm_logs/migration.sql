-- LLM interaction logging for telemetry and LoRA training data
CREATE TABLE "LLMInteractionLog" (
    "id"                  TEXT NOT NULL PRIMARY KEY,
    "sessionId"           TEXT NOT NULL DEFAULT '',
    "feature"             TEXT NOT NULL DEFAULT 'unknown',
    "specId"              TEXT,
    "prompt"              TEXT NOT NULL DEFAULT '',
    "completion"          TEXT NOT NULL DEFAULT '',
    "outcome"             TEXT NOT NULL DEFAULT 'pending',
    "correctedCompletion" TEXT,
    "promptTokens"        INTEGER NOT NULL DEFAULT 0,
    "completionTokens"    INTEGER NOT NULL DEFAULT 0,
    "totalTokens"         INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd"    REAL NOT NULL DEFAULT 0,
    "latencyMs"           INTEGER NOT NULL DEFAULT 0,
    "modelUsed"           TEXT NOT NULL DEFAULT '',
    "provider"            TEXT NOT NULL DEFAULT '',
    "locatorsVerified"    INTEGER,
    "testPassedFirstRun"  INTEGER,
    "createdAt"           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "LLMInteractionLog_feature_idx" ON "LLMInteractionLog"("feature");
CREATE INDEX "LLMInteractionLog_outcome_idx" ON "LLMInteractionLog"("outcome");
CREATE INDEX "LLMInteractionLog_createdAt_idx" ON "LLMInteractionLog"("createdAt");
CREATE INDEX "LLMInteractionLog_specId_idx" ON "LLMInteractionLog"("specId");
