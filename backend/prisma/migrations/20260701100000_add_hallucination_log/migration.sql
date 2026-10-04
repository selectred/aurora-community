CREATE TABLE IF NOT EXISTS "HallucinationLog" (
    "id"                  TEXT     NOT NULL PRIMARY KEY,
    "promptKey"           TEXT     NOT NULL,
    "promptVersionHash"   TEXT     NOT NULL,
    "failureType"         TEXT     NOT NULL,
    "aiOutputSnippet"     TEXT     NOT NULL DEFAULT '',
    "userMessageSnippet"  TEXT,
    "ariaSnapshotSnippet" TEXT,
    "targetUrl"           TEXT,
    "healAttempts"        INTEGER  NOT NULL DEFAULT 0,
    "resolved"            BOOLEAN  NOT NULL DEFAULT false,
    "userFeedback"        TEXT,
    "createdAt"           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "HallucinationLog_promptKey_idx" ON "HallucinationLog"("promptKey");
CREATE INDEX IF NOT EXISTS "HallucinationLog_promptKey_resolved_idx" ON "HallucinationLog"("promptKey", "resolved");
CREATE INDEX IF NOT EXISTS "HallucinationLog_createdAt_idx" ON "HallucinationLog"("createdAt");
