-- Add validatedAt to AgentTestSpec to track when a spec was last validated in a live browser
ALTER TABLE "AgentTestSpec" ADD COLUMN "validatedAt" DATETIME;
