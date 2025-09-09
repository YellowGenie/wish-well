-- Proposal Enhancement Migration
-- This migration adds new fields to support the enhanced proposal workflow

-- Add new fields to proposals table
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS draft_offering TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS pricing_details TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS availability TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS viewed_by_manager BOOLEAN DEFAULT FALSE;

-- Update the status enum to include new status types
-- Note: This may need to be adjusted based on your current database setup
ALTER TABLE proposals MODIFY COLUMN status ENUM(
    'pending',
    'accepted', 
    'rejected',
    'withdrawn',
    'interview',
    'approved',
    'no_longer_accepting',
    'inappropriate'
) DEFAULT 'pending';

-- Create index for faster proposal counting queries
CREATE INDEX IF NOT EXISTS idx_proposals_job_viewed ON proposals(job_id, viewed_by_manager);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_job_status ON proposals(job_id, status);

-- Add sample data or update existing records if needed
UPDATE proposals SET viewed_by_manager = TRUE WHERE status IN ('accepted', 'rejected');