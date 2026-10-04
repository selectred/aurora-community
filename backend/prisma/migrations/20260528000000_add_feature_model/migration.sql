-- CreateTable
CREATE TABLE "Feature" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "name"         TEXT NOT NULL,
    "description"  TEXT,
    "initiativeId" TEXT NOT NULL,
    "teamId"       TEXT,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Feature_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "StrategicInitiative" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Feature_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Feature_initiativeId_idx" ON "Feature"("initiativeId");
CREATE INDEX "Feature_teamId_idx" ON "Feature"("teamId");

-- AlterTable: add featureId to TestPack
ALTER TABLE "TestPack" ADD COLUMN "featureId" TEXT REFERENCES "Feature"("id") ON DELETE SET NULL ON UPDATE CASCADE;
