-- CreateTable
CREATE TABLE "TestDataFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "headersJson" TEXT NOT NULL DEFAULT '[]',
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "previewJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- AddColumn
ALTER TABLE "TestPack" ADD COLUMN "testDataFileId" TEXT;
ALTER TABLE "TestPack" ADD COLUMN "testDataContinuumId" TEXT;
ALTER TABLE "TestPack" ADD COLUMN "testDataMode" TEXT NOT NULL DEFAULT 'none';

-- AddForeignKey (SQLite: just add index, FK constraint not enforced but Prisma tracks it)
CREATE INDEX "TestPack_testDataFileId_idx" ON "TestPack"("testDataFileId");
