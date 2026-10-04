-- CreateTable
CREATE TABLE "AppSettings" (
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
    "setupCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "licenseKey" TEXT,
    "tier" TEXT NOT NULL DEFAULT 'free',
    "limitsJson" TEXT NOT NULL DEFAULT '{}',
    "registeredName" TEXT,
    "registeredEmail" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "activatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "usageJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT '#7367F0',
    "metricsJson" TEXT NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "leadId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Team_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "TeamMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "role" TEXT NOT NULL DEFAULT 'qa_engineer',
    "avatarColor" TEXT NOT NULL DEFAULT '#7367F0',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "statsJson" TEXT NOT NULL DEFAULT '{}',
    "teamId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestResult" (
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

-- CreateTable
CREATE TABLE "AgentTestSpec" (
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

-- CreateTable
CREATE TABLE "SyntheticTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "scriptPath" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "schedule" TEXT NOT NULL DEFAULT '*/30 * * * *',
    "timeout" INTEGER NOT NULL DEFAULT 60000,
    "retryOnFailure" BOOLEAN NOT NULL DEFAULT false,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "teamId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SyntheticTransaction_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyntheticResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "transactionName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "pageMetricsJson" TEXT NOT NULL DEFAULT '[]',
    "errorMessage" TEXT,
    "stackTrace" TEXT,
    "screenshot" TEXT,
    "browser" TEXT NOT NULL DEFAULT 'chromium',
    "viewportJson" TEXT NOT NULL DEFAULT '{}',
    "userAgent" TEXT,
    "scheduledRun" BOOLEAN NOT NULL DEFAULT false,
    "cronSchedule" TEXT,
    "executedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SyntheticResult_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "SyntheticTransaction" ("transactionId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StrategicInitiative" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'planning',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "targetQuarter" TEXT,
    "startDate" DATETIME,
    "targetDate" DATETIME,
    "completedDate" DATETIME,
    "milestonesJson" TEXT NOT NULL DEFAULT '[]',
    "metricsJson" TEXT NOT NULL DEFAULT '{}',
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "teamId" TEXT,
    "assigneeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StrategicInitiative_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StrategicInitiative_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "TeamMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "APIKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "hashedKey" TEXT NOT NULL,
    "permissionsJson" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsed" DATETIME,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TestPack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "schedule" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" DATETIME,
    "lastRunResultsJson" TEXT NOT NULL DEFAULT '{}',
    "teamId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TestPack_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestPackTest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testPackId" TEXT NOT NULL,
    "specId" TEXT NOT NULL,
    CONSTRAINT "TestPackTest_testPackId_fkey" FOREIGN KEY ("testPackId") REFERENCES "TestPack" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestPackTest_specId_fkey" FOREIGN KEY ("specId") REFERENCES "AgentTestSpec" ("specId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "APITest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "statusCode" INTEGER,
    "responseTime" INTEGER,
    "errorMessage" TEXT,
    "testScript" TEXT,
    "coverage" REAL,
    "teamId" TEXT,
    "executedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "APITest_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentTerminalSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "currentPlanJson" TEXT NOT NULL DEFAULT '{}',
    "generatedSpecsJson" TEXT NOT NULL DEFAULT '[]',
    "lastRunJson" TEXT NOT NULL DEFAULT '{}',
    "messagesJson" TEXT NOT NULL DEFAULT '[]',
    "teamId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentTerminalSession_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "License_licenseKey_key" ON "License"("licenseKey");

-- CreateIndex
CREATE UNIQUE INDEX "Team_name_key" ON "Team"("name");

-- CreateIndex
CREATE INDEX "TestResult_testCaseId_idx" ON "TestResult"("testCaseId");

-- CreateIndex
CREATE INDEX "TestResult_testType_status_executedAt_idx" ON "TestResult"("testType", "status", "executedAt");

-- CreateIndex
CREATE INDEX "TestResult_teamId_executedAt_idx" ON "TestResult"("teamId", "executedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTestSpec_specId_key" ON "AgentTestSpec"("specId");

-- CreateIndex
CREATE INDEX "AgentTestSpec_specId_idx" ON "AgentTestSpec"("specId");

-- CreateIndex
CREATE INDEX "AgentTestSpec_status_idx" ON "AgentTestSpec"("status");

-- CreateIndex
CREATE INDEX "AgentTestSpec_enabled_idx" ON "AgentTestSpec"("enabled");

-- CreateIndex
CREATE INDEX "AgentTestSpec_isSynthetic_idx" ON "AgentTestSpec"("isSynthetic");

-- CreateIndex
CREATE INDEX "AgentTestSpec_testType_idx" ON "AgentTestSpec"("testType");

-- CreateIndex
CREATE UNIQUE INDEX "SyntheticTransaction_transactionId_key" ON "SyntheticTransaction"("transactionId");

-- CreateIndex
CREATE INDEX "SyntheticTransaction_transactionId_idx" ON "SyntheticTransaction"("transactionId");

-- CreateIndex
CREATE INDEX "SyntheticResult_transactionId_executedAt_idx" ON "SyntheticResult"("transactionId", "executedAt");

-- CreateIndex
CREATE INDEX "SyntheticResult_status_executedAt_idx" ON "SyntheticResult"("status", "executedAt");

-- CreateIndex
CREATE INDEX "SyntheticResult_executedAt_idx" ON "SyntheticResult"("executedAt");

-- CreateIndex
CREATE INDEX "StrategicInitiative_status_idx" ON "StrategicInitiative"("status");

-- CreateIndex
CREATE INDEX "StrategicInitiative_teamId_idx" ON "StrategicInitiative"("teamId");

-- CreateIndex
CREATE INDEX "StrategicInitiative_isActive_idx" ON "StrategicInitiative"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "APIKey_key_key" ON "APIKey"("key");

-- CreateIndex
CREATE INDEX "TestPack_teamId_idx" ON "TestPack"("teamId");

-- CreateIndex
CREATE INDEX "TestPack_name_idx" ON "TestPack"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TestPackTest_testPackId_specId_key" ON "TestPackTest"("testPackId", "specId");

-- CreateIndex
CREATE INDEX "APITest_endpoint_idx" ON "APITest"("endpoint");

-- CreateIndex
CREATE INDEX "APITest_service_idx" ON "APITest"("service");

-- CreateIndex
CREATE INDEX "APITest_executedAt_idx" ON "APITest"("executedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTerminalSession_sessionId_key" ON "AgentTerminalSession"("sessionId");

-- CreateIndex
CREATE INDEX "AgentTerminalSession_sessionId_idx" ON "AgentTerminalSession"("sessionId");
