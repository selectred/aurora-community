-- Performance (k6) authoring: scripts, scenarios, local runs
ALTER TABLE "AppSettings" ADD COLUMN "perfSettingsJson" TEXT NOT NULL DEFAULT '{}';

CREATE TABLE "PerfScript" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "scriptType" TEXT NOT NULL DEFAULT 'http',
    "script" TEXT NOT NULL,
    "envVarsJson" TEXT NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "lastSmokeJson" TEXT,
    "lastSmokeAt" DATETIME,
    "pushedAt" DATETIME,
    "continuumScenarioId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "PerfScript_name_key" ON "PerfScript"("name");

CREATE TABLE "PerfScenario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "scriptId" TEXT NOT NULL,
    "loadJson" TEXT NOT NULL DEFAULT '{}',
    "thresholdsJson" TEXT NOT NULL DEFAULT '{}',
    "thinkTimeSec" REAL,
    "baselineRunId" TEXT,
    "pushedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PerfScenario_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "PerfScript" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PerfScenario_name_key" ON "PerfScenario"("name");

CREATE TABLE "PerfRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scenarioId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "scriptSnapshot" TEXT NOT NULL,
    "scriptType" TEXT NOT NULL DEFAULT 'http',
    "loadSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "thresholdsSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "metricsJson" TEXT NOT NULL DEFAULT '{}',
    "thresholdResultsJson" TEXT NOT NULL DEFAULT '[]',
    "timeseriesJson" TEXT NOT NULL DEFAULT '[]',
    "comparisonJson" TEXT,
    "liveJson" TEXT,
    "consoleLog" TEXT NOT NULL DEFAULT '',
    "exitCode" INTEGER,
    "errorMessage" TEXT,
    "queuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    CONSTRAINT "PerfRun_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "PerfScenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PerfRun_scenarioId_queuedAt_idx" ON "PerfRun"("scenarioId", "queuedAt");
