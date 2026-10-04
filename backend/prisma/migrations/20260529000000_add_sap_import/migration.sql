-- CreateTable
CREATE TABLE IF NOT EXISTS "SapImport" (
    "id"         TEXT NOT NULL PRIMARY KEY,
    "name"       TEXT NOT NULL,
    "module"     TEXT NOT NULL,
    "rowCount"   INTEGER NOT NULL DEFAULT 0,
    "mappingCsv" TEXT NOT NULL DEFAULT '',
    "sourceUrl"  TEXT NOT NULL DEFAULT '',
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
