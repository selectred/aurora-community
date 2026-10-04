-- Licence server status, for the Settings page and banners
ALTER TABLE "License" ADD COLUMN "remoteStatus" TEXT;
ALTER TABLE "License" ADD COLUMN "statusMessage" TEXT;
