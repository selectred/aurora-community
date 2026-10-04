-- CreateTable
CREATE TABLE "BugReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "source" TEXT NOT NULL,
    "errorMessage" TEXT,
    "stackTrace" TEXT,
    "screenshotPath" TEXT,
    "reproSteps" TEXT,
    "consecutiveFails" INTEGER NOT NULL DEFAULT 1,
    "firstFailedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastFailedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "specId" TEXT,
    "packId" TEXT,
    "healId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BugReport_specId_fkey" FOREIGN KEY ("specId") REFERENCES "AgentTestSpec" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "teamId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TestPack_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TestPack" ("createdAt", "description", "id", "isActive", "lastRunAt", "lastRunResultsJson", "name", "schedule", "teamId", "updatedAt") SELECT "createdAt", "description", "id", "isActive", "lastRunAt", "lastRunResultsJson", "name", "schedule", "teamId", "updatedAt" FROM "TestPack";
DROP TABLE "TestPack";
ALTER TABLE "new_TestPack" RENAME TO "TestPack";
CREATE INDEX "TestPack_teamId_idx" ON "TestPack"("teamId");
CREATE INDEX "TestPack_name_idx" ON "TestPack"("name");
CREATE TABLE "new_TestPackTest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testPackId" TEXT NOT NULL,
    "specId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TestPackTest_testPackId_fkey" FOREIGN KEY ("testPackId") REFERENCES "TestPack" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestPackTest_specId_fkey" FOREIGN KEY ("specId") REFERENCES "AgentTestSpec" ("specId") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TestPackTest" ("id", "specId", "testPackId") SELECT "id", "specId", "testPackId" FROM "TestPackTest";
DROP TABLE "TestPackTest";
ALTER TABLE "new_TestPackTest" RENAME TO "TestPackTest";
CREATE INDEX "TestPackTest_testPackId_sortOrder_idx" ON "TestPackTest"("testPackId", "sortOrder");
CREATE UNIQUE INDEX "TestPackTest_testPackId_specId_key" ON "TestPackTest"("testPackId", "specId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "BugReport_status_idx" ON "BugReport"("status");

-- CreateIndex
CREATE INDEX "BugReport_severity_idx" ON "BugReport"("severity");

-- CreateIndex
CREATE INDEX "BugReport_specId_idx" ON "BugReport"("specId");

-- CreateIndex
CREATE INDEX "BugReport_source_idx" ON "BugReport"("source");
