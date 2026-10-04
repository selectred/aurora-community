-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AgentTestSpec" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "specId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "testType" TEXT NOT NULL DEFAULT 'functional',
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "promotedToSyntheticAt" DATETIME,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'GET',
    "headers" TEXT NOT NULL DEFAULT '',
    "requestBody" TEXT NOT NULL DEFAULT '',
    "expectedStatus" INTEGER NOT NULL DEFAULT 200,
    "alertThreshold" INTEGER NOT NULL DEFAULT 3000,
    "markdownSpec" TEXT NOT NULL,
    "generatedCode" TEXT,
    "codeStorage" TEXT NOT NULL DEFAULT 'inline',
    "codeFilePath" TEXT,
    "fixturesFilePath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "schedule" TEXT NOT NULL DEFAULT '*/30 * * * *',
    "timeout" INTEGER NOT NULL DEFAULT 60000,
    "healCount" INTEGER NOT NULL DEFAULT 0,
    "lastHealDetailsJson" TEXT NOT NULL DEFAULT '{}',
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "generationMetaJson" TEXT NOT NULL DEFAULT '{}',
    "teamId" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentTestSpec_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AgentTestSpec_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "TeamMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AgentTestSpec" ("alertThreshold", "createdAt", "createdById", "description", "enabled", "expectedStatus", "generatedCode", "generationMetaJson", "headers", "healCount", "id", "isSynthetic", "lastHealDetailsJson", "markdownSpec", "method", "name", "promotedToSyntheticAt", "requestBody", "schedule", "specId", "status", "tagsJson", "teamId", "testType", "timeout", "updatedAt", "url") SELECT "alertThreshold", "createdAt", "createdById", "description", "enabled", "expectedStatus", "generatedCode", "generationMetaJson", "headers", "healCount", "id", "isSynthetic", "lastHealDetailsJson", "markdownSpec", "method", "name", "promotedToSyntheticAt", "requestBody", "schedule", "specId", "status", "tagsJson", "teamId", "testType", "timeout", "updatedAt", "url" FROM "AgentTestSpec";
DROP TABLE "AgentTestSpec";
ALTER TABLE "new_AgentTestSpec" RENAME TO "AgentTestSpec";
CREATE UNIQUE INDEX "AgentTestSpec_specId_key" ON "AgentTestSpec"("specId");
CREATE INDEX "AgentTestSpec_specId_idx" ON "AgentTestSpec"("specId");
CREATE INDEX "AgentTestSpec_status_idx" ON "AgentTestSpec"("status");
CREATE INDEX "AgentTestSpec_enabled_idx" ON "AgentTestSpec"("enabled");
CREATE INDEX "AgentTestSpec_isSynthetic_idx" ON "AgentTestSpec"("isSynthetic");
CREATE INDEX "AgentTestSpec_testType_idx" ON "AgentTestSpec"("testType");
CREATE TABLE "new_AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "managerName" TEXT NOT NULL DEFAULT 'Manager',
    "email" TEXT,
    "preferencesJson" TEXT NOT NULL DEFAULT '{}',
    "anthropicKey" TEXT NOT NULL DEFAULT '',
    "openaiKey" TEXT NOT NULL DEFAULT '',
    "azureOpenaiKey" TEXT NOT NULL DEFAULT '',
    "azureOpenaiEndpoint" TEXT NOT NULL DEFAULT '',
    "azureOpenaiDeployment" TEXT NOT NULL DEFAULT '',
    "activeAiProvider" TEXT NOT NULL DEFAULT 'none',
    "syntheticDefaultsJson" TEXT NOT NULL DEFAULT '{}',
    "continuumEnabled" BOOLEAN NOT NULL DEFAULT false,
    "continuumUrl" TEXT NOT NULL DEFAULT '',
    "continuumApiKey" TEXT NOT NULL DEFAULT '',
    "packsRootDir" TEXT,
    "packFileSizeThreshold" INTEGER NOT NULL DEFAULT 8192,
    "maxPackCount" INTEGER,
    "setupCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppSettings" ("activeAiProvider", "anthropicKey", "azureOpenaiDeployment", "azureOpenaiEndpoint", "azureOpenaiKey", "continuumApiKey", "continuumEnabled", "continuumUrl", "createdAt", "email", "id", "managerName", "openaiKey", "preferencesJson", "setupCompleted", "syntheticDefaultsJson", "updatedAt") SELECT "activeAiProvider", "anthropicKey", "azureOpenaiDeployment", "azureOpenaiEndpoint", "azureOpenaiKey", "continuumApiKey", "continuumEnabled", "continuumUrl", "createdAt", "email", "id", "managerName", "openaiKey", "preferencesJson", "setupCompleted", "syntheticDefaultsJson", "updatedAt" FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
