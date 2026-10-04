-- AddColumn: change history and user notes on BugReport
ALTER TABLE "BugReport" ADD COLUMN "historyJson" TEXT;
ALTER TABLE "BugReport" ADD COLUMN "notesJson" TEXT;
