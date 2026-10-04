/*
  Warnings:

  - You are about to alter the column `locatorsVerified` on the `LLMInteractionLog` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Boolean`.
  - You are about to alter the column `testPassedFirstRun` on the `LLMInteractionLog` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Boolean`.

*/
-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN "encryptionKey" TEXT;

-- CreateTable
CREATE TABLE "PackVariable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testPackId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PackVariable_testPackId_fkey" FOREIGN KEY ("testPackId") REFERENCES "TestPack" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestEnvironment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL DEFAULT '',
    "variables" TEXT NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT NOT NULL DEFAULT 'blue',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

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
    "engine" TEXT NOT NULL DEFAULT 'playwright',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "schedule" TEXT NOT NULL DEFAULT '*/30 * * * *',
    "timeout" INTEGER NOT NULL DEFAULT 60000,
    "healCount" INTEGER NOT NULL DEFAULT 0,
    "validatedAt" DATETIME,
    "lastHealDetailsJson" TEXT NOT NULL DEFAULT '{}',
    "lastResultJson" TEXT NOT NULL DEFAULT '{}',
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "generationMetaJson" TEXT NOT NULL DEFAULT '{}',
    "intentJson" TEXT,
    "teamId" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentTestSpec_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AgentTestSpec_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "TeamMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AgentTestSpec" ("alertThreshold", "codeFilePath", "codeStorage", "createdAt", "createdById", "description", "enabled", "expectedStatus", "fixturesFilePath", "generatedCode", "generationMetaJson", "headers", "healCount", "id", "intentJson", "isSynthetic", "lastHealDetailsJson", "markdownSpec", "method", "name", "promotedToSyntheticAt", "requestBody", "schedule", "specId", "status", "tagsJson", "teamId", "testType", "timeout", "updatedAt", "url", "validatedAt") SELECT "alertThreshold", "codeFilePath", "codeStorage", "createdAt", "createdById", "description", "enabled", "expectedStatus", "fixturesFilePath", "generatedCode", "generationMetaJson", "headers", "healCount", "id", "intentJson", "isSynthetic", "lastHealDetailsJson", "markdownSpec", "method", "name", "promotedToSyntheticAt", "requestBody", "schedule", "specId", "status", "tagsJson", "teamId", "testType", "timeout", "updatedAt", "url", "validatedAt" FROM "AgentTestSpec";
DROP TABLE "AgentTestSpec";
ALTER TABLE "new_AgentTestSpec" RENAME TO "AgentTestSpec";
CREATE UNIQUE INDEX "AgentTestSpec_specId_key" ON "AgentTestSpec"("specId");
CREATE INDEX "AgentTestSpec_specId_idx" ON "AgentTestSpec"("specId");
CREATE INDEX "AgentTestSpec_status_idx" ON "AgentTestSpec"("status");
CREATE INDEX "AgentTestSpec_enabled_idx" ON "AgentTestSpec"("enabled");
CREATE INDEX "AgentTestSpec_isSynthetic_idx" ON "AgentTestSpec"("isSynthetic");
CREATE INDEX "AgentTestSpec_testType_idx" ON "AgentTestSpec"("testType");
CREATE TABLE "new_Feature" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "initiativeId" TEXT NOT NULL,
    "teamId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Feature_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "StrategicInitiative" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Feature_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Feature" ("createdAt", "description", "id", "initiativeId", "name", "teamId", "updatedAt") SELECT "createdAt", "description", "id", "initiativeId", "name", "teamId", "updatedAt" FROM "Feature";
DROP TABLE "Feature";
ALTER TABLE "new_Feature" RENAME TO "Feature";
CREATE INDEX "Feature_initiativeId_idx" ON "Feature"("initiativeId");
CREATE INDEX "Feature_teamId_idx" ON "Feature"("teamId");
CREATE TABLE "new_LLMInteractionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL DEFAULT '',
    "feature" TEXT NOT NULL DEFAULT 'unknown',
    "specId" TEXT,
    "prompt" TEXT NOT NULL DEFAULT '',
    "completion" TEXT NOT NULL DEFAULT '',
    "outcome" TEXT NOT NULL DEFAULT 'pending',
    "correctedCompletion" TEXT,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" REAL NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "modelUsed" TEXT NOT NULL DEFAULT '',
    "provider" TEXT NOT NULL DEFAULT '',
    "locatorsVerified" BOOLEAN,
    "testPassedFirstRun" BOOLEAN,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_LLMInteractionLog" ("completion", "completionTokens", "correctedCompletion", "createdAt", "estimatedCostUsd", "feature", "id", "latencyMs", "locatorsVerified", "modelUsed", "outcome", "prompt", "promptTokens", "provider", "sessionId", "specId", "testPassedFirstRun", "totalTokens") SELECT "completion", "completionTokens", "correctedCompletion", "createdAt", "estimatedCostUsd", "feature", "id", "latencyMs", "locatorsVerified", "modelUsed", "outcome", "prompt", "promptTokens", "provider", "sessionId", "specId", "testPassedFirstRun", "totalTokens" FROM "LLMInteractionLog";
DROP TABLE "LLMInteractionLog";
ALTER TABLE "new_LLMInteractionLog" RENAME TO "LLMInteractionLog";
CREATE TABLE "new_TestPack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "schedule" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" DATETIME,
    "packSetupCode" TEXT,
    "packTeardownCode" TEXT,
    "contextJson" TEXT NOT NULL DEFAULT '{}',
    "lastRunResultsJson" TEXT NOT NULL DEFAULT '{}',
    "testDataFileId" TEXT,
    "testDataContinuumId" TEXT,
    "testDataMode" TEXT NOT NULL DEFAULT 'none',
    "teamId" TEXT,
    "initiativeId" TEXT,
    "featureId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TestPack_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TestPack_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "StrategicInitiative" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TestPack_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TestPack_testDataFileId_fkey" FOREIGN KEY ("testDataFileId") REFERENCES "TestDataFile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TestPack" ("contextJson", "createdAt", "description", "featureId", "id", "initiativeId", "isActive", "lastRunAt", "lastRunResultsJson", "name", "packSetupCode", "packTeardownCode", "schedule", "teamId", "testDataContinuumId", "testDataFileId", "testDataMode", "updatedAt") SELECT "contextJson", "createdAt", "description", "featureId", "id", "initiativeId", "isActive", "lastRunAt", "lastRunResultsJson", "name", "packSetupCode", "packTeardownCode", "schedule", "teamId", "testDataContinuumId", "testDataFileId", "testDataMode", "updatedAt" FROM "TestPack";
DROP TABLE "TestPack";
ALTER TABLE "new_TestPack" RENAME TO "TestPack";
CREATE INDEX "TestPack_teamId_idx" ON "TestPack"("teamId");
CREATE INDEX "TestPack_name_idx" ON "TestPack"("name");
CREATE TABLE "new_TestResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testCaseId" TEXT NOT NULL,
    "testName" TEXT NOT NULL,
    "testType" TEXT NOT NULL,
    "suite" TEXT,
    "status" TEXT NOT NULL,
    "duration" INTEGER,
    "errorMessage" TEXT,
    "stackTrace" TEXT,
    "screenshot" TEXT,
    "browser" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'staging',
    "scriptLocation" TEXT,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "engine" TEXT NOT NULL DEFAULT 'playwright',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "teamId" TEXT,
    "executedById" TEXT,
    "specId" TEXT,
    "executedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TestResult_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TestResult_executedById_fkey" FOREIGN KEY ("executedById") REFERENCES "TeamMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TestResult_specId_fkey" FOREIGN KEY ("specId") REFERENCES "AgentTestSpec" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TestResult" ("browser", "createdAt", "duration", "environment", "errorMessage", "executedAt", "executedById", "id", "metadataJson", "retries", "screenshot", "scriptLocation", "specId", "stackTrace", "status", "suite", "teamId", "testCaseId", "testName", "testType") SELECT "browser", "createdAt", "duration", "environment", "errorMessage", "executedAt", "executedById", "id", "metadataJson", "retries", "screenshot", "scriptLocation", "specId", "stackTrace", "status", "suite", "teamId", "testCaseId", "testName", "testType" FROM "TestResult";
DROP TABLE "TestResult";
ALTER TABLE "new_TestResult" RENAME TO "TestResult";
CREATE INDEX "TestResult_testCaseId_idx" ON "TestResult"("testCaseId");
CREATE INDEX "TestResult_testType_status_executedAt_idx" ON "TestResult"("testType", "status", "executedAt");
CREATE INDEX "TestResult_teamId_executedAt_idx" ON "TestResult"("teamId", "executedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PackVariable_testPackId_idx" ON "PackVariable"("testPackId");

-- CreateIndex
CREATE UNIQUE INDEX "PackVariable_testPackId_name_key" ON "PackVariable"("testPackId", "name");

-- CreateIndex
CREATE INDEX "TestEnvironment_isActive_idx" ON "TestEnvironment"("isActive");
