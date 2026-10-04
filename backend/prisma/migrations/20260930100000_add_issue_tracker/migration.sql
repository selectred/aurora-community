-- Issue tracker integration (Jira / Azure DevOps)
ALTER TABLE "AppSettings" ADD COLUMN "trackerProvider" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "AppSettings" ADD COLUMN "trackerConfigJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "AppSettings" ADD COLUMN "trackerToken" TEXT NOT NULL DEFAULT '';
ALTER TABLE "BugReport" ADD COLUMN "trackerKey" TEXT;
ALTER TABLE "BugReport" ADD COLUMN "trackerUrl" TEXT;
