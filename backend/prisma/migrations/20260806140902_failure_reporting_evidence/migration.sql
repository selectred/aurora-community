-- AlterTable
ALTER TABLE "BugReport" ADD COLUMN "evidenceDir" TEXT;

-- AlterTable
ALTER TABLE "TestResult" ADD COLUMN "evidenceDir" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "localLlmEndpoint" TEXT NOT NULL DEFAULT '',
    "localLlmModel" TEXT NOT NULL DEFAULT '',
    "localLlmApiKey" TEXT NOT NULL DEFAULT '',
    "activeAiProvider" TEXT NOT NULL DEFAULT 'none',
    "syntheticDefaultsJson" TEXT NOT NULL DEFAULT '{}',
    "continuumEnabled" BOOLEAN NOT NULL DEFAULT false,
    "continuumUrl" TEXT NOT NULL DEFAULT '',
    "continuumApiKey" TEXT NOT NULL DEFAULT '',
    "packsRootDir" TEXT,
    "packFileSizeThreshold" INTEGER NOT NULL DEFAULT 8192,
    "maxPackCount" INTEGER,
    "evidenceRootDir" TEXT,
    "evidenceRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "evidenceCaptureEnabled" BOOLEAN NOT NULL DEFAULT true,
    "ragRedThresholdPct" INTEGER NOT NULL DEFAULT 50,
    "setupCompleted" BOOLEAN NOT NULL DEFAULT false,
    "encryptionKey" TEXT,
    "machineId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppSettings" ("activeAiProvider", "anthropicKey", "azureOpenaiDeployment", "azureOpenaiEndpoint", "azureOpenaiKey", "continuumApiKey", "continuumEnabled", "continuumUrl", "createdAt", "email", "encryptionKey", "id", "localLlmApiKey", "localLlmEndpoint", "localLlmModel", "machineId", "managerName", "maxPackCount", "openaiKey", "packFileSizeThreshold", "packsRootDir", "preferencesJson", "setupCompleted", "syntheticDefaultsJson", "updatedAt") SELECT "activeAiProvider", "anthropicKey", "azureOpenaiDeployment", "azureOpenaiEndpoint", "azureOpenaiKey", "continuumApiKey", "continuumEnabled", "continuumUrl", "createdAt", "email", "encryptionKey", "id", "localLlmApiKey", "localLlmEndpoint", "localLlmModel", "machineId", "managerName", "maxPackCount", "openaiKey", "packFileSizeThreshold", "packsRootDir", "preferencesJson", "setupCompleted", "syntheticDefaultsJson", "updatedAt" FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
