-- Enhanced Messaging and Interview System Migration
-- This migration adds comprehensive support for:
-- 1. Enhanced messaging with file uploads and content filtering
-- 2. Full interview lifecycle management
-- 3. Admin oversight and moderation

-- Enhanced Messages Table
-- Add new columns to existing messages table
ALTER TABLE messages 
ADD COLUMN message_type ENUM('text', 'file', 'image', 'audio', 'code') DEFAULT 'text',
ADD COLUMN file_url VARCHAR(500) NULL,
ADD COLUMN file_name VARCHAR(255) NULL,
ADD COLUMN file_size INT NULL,
ADD COLUMN file_type VARCHAR(100) NULL,
ADD COLUMN is_system_message BOOLEAN DEFAULT FALSE,
ADD COLUMN parent_message_id INT NULL,
ADD COLUMN is_flagged BOOLEAN DEFAULT FALSE,
ADD COLUMN flagged_reason TEXT NULL,
ADD COLUMN flagged_by INT NULL,
ADD COLUMN flagged_at TIMESTAMP NULL,
ADD COLUMN edited_at TIMESTAMP NULL,
ADD COLUMN conversation_type ENUM('job', 'direct', 'interview') DEFAULT 'job',
ADD COLUMN metadata JSON NULL;

-- Add foreign key constraints
ALTER TABLE messages 
ADD CONSTRAINT fk_messages_parent FOREIGN KEY (parent_message_id) REFERENCES messages(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_messages_flagged_by FOREIGN KEY (flagged_by) REFERENCES users(id) ON DELETE SET NULL;

-- Create Conversations Table for better organization
CREATE TABLE conversations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type ENUM('job', 'direct', 'interview') NOT NULL,
    title VARCHAR(255) NULL,
    participant_1_id INT NOT NULL,
    participant_2_id INT NOT NULL,
    job_id INT NULL,
    interview_id INT NULL,
    status ENUM('active', 'archived', 'blocked') DEFAULT 'active',
    last_message_id INT NULL,
    last_message_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (participant_1_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (participant_2_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL,
    FOREIGN KEY (last_message_id) REFERENCES messages(id) ON DELETE SET NULL,
    
    UNIQUE KEY unique_conversation (type, participant_1_id, participant_2_id, job_id, interview_id),
    INDEX idx_conversations_participants (participant_1_id, participant_2_id),
    INDEX idx_conversations_type (type),
    INDEX idx_conversations_last_message (last_message_at)
);

-- Create Interviews Table
CREATE TABLE interviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    manager_id INT NOT NULL,
    talent_id INT NOT NULL,
    job_id INT NULL,
    proposal_id INT NULL,
    conversation_id INT NULL,
    
    -- Interview Status and Lifecycle
    status ENUM('created', 'sent', 'in_progress', 'completed', 'reviewed', 'next_steps', 'rejected', 'inappropriate', 'hold', 'cancelled') DEFAULT 'created',
    priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
    
    -- Interview Details
    questions JSON NULL, -- Array of question objects
    estimated_duration INT NULL, -- in minutes
    actual_duration INT NULL, -- in minutes
    
    -- Scheduling
    scheduled_at TIMESTAMP NULL,
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    
    -- Ratings and Feedback
    manager_rating INT NULL CHECK (manager_rating >= 1 AND manager_rating <= 5),
    manager_feedback TEXT NULL,
    talent_rating INT NULL CHECK (talent_rating >= 1 AND talent_rating <= 5),
    talent_feedback TEXT NULL,
    
    -- Admin oversight
    is_flagged BOOLEAN DEFAULT FALSE,
    flagged_reason TEXT NULL,
    flagged_by INT NULL,
    flagged_at TIMESTAMP NULL,
    admin_notes TEXT NULL,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    
    FOREIGN KEY (manager_id) REFERENCES manager_profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (talent_id) REFERENCES talent_profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL,
    FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE SET NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
    FOREIGN KEY (flagged_by) REFERENCES users(id) ON DELETE SET NULL,
    
    INDEX idx_interviews_manager (manager_id),
    INDEX idx_interviews_talent (talent_id),
    INDEX idx_interviews_status (status),
    INDEX idx_interviews_scheduled (scheduled_at),
    INDEX idx_interviews_created (created_at)
);

-- Create Interview Questions Table for flexible question management
CREATE TABLE interview_questions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    interview_id INT NOT NULL,
    question_text TEXT NOT NULL,
    question_type ENUM('text', 'multiple_choice', 'coding', 'practical') DEFAULT 'text',
    question_order INT NOT NULL,
    is_required BOOLEAN DEFAULT TRUE,
    expected_duration INT NULL, -- in minutes
    answer_text TEXT NULL,
    answered_at TIMESTAMP NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE CASCADE,
    
    INDEX idx_interview_questions_interview (interview_id),
    INDEX idx_interview_questions_order (interview_id, question_order)
);

-- Create Interview Participants Table (for future multi-participant interviews)
CREATE TABLE interview_participants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    interview_id INT NOT NULL,
    user_id INT NOT NULL,
    role ENUM('interviewer', 'interviewee', 'observer') NOT NULL,
    status ENUM('invited', 'accepted', 'declined', 'no_response') DEFAULT 'invited',
    joined_at TIMESTAMP NULL,
    left_at TIMESTAMP NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    
    UNIQUE KEY unique_participant (interview_id, user_id),
    INDEX idx_interview_participants_interview (interview_id),
    INDEX idx_interview_participants_user (user_id)
);

-- Create Message Attachments Table
CREATE TABLE message_attachments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message_id INT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INT NOT NULL,
    file_type VARCHAR(100) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    is_scanned BOOLEAN DEFAULT FALSE,
    scan_result VARCHAR(50) NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    
    INDEX idx_message_attachments_message (message_id),
    INDEX idx_message_attachments_type (file_type)
);

-- Create Content Filter Violations Table
CREATE TABLE content_filter_violations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message_id INT NOT NULL,
    violation_type ENUM('email', 'phone', 'external_link', 'inappropriate', 'spam') NOT NULL,
    detected_content TEXT NOT NULL,
    confidence_score DECIMAL(3,2) DEFAULT 1.00,
    action_taken ENUM('flagged', 'blocked', 'reviewed', 'approved') DEFAULT 'flagged',
    reviewed_by INT NULL,
    reviewed_at TIMESTAMP NULL,
    admin_notes TEXT NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
    
    INDEX idx_content_violations_message (message_id),
    INDEX idx_content_violations_type (violation_type),
    INDEX idx_content_violations_action (action_taken)
);

-- Create Message Read Receipts Table for better tracking
CREATE TABLE message_read_receipts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message_id INT NOT NULL,
    user_id INT NOT NULL,
    read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    
    UNIQUE KEY unique_read_receipt (message_id, user_id),
    INDEX idx_read_receipts_message (message_id),
    INDEX idx_read_receipts_user (user_id)
);

-- Create Interview Status History Table
CREATE TABLE interview_status_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    interview_id INT NOT NULL,
    old_status VARCHAR(50) NULL,
    new_status VARCHAR(50) NOT NULL,
    changed_by INT NOT NULL,
    change_reason TEXT NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE CASCADE,
    
    INDEX idx_interview_status_history_interview (interview_id),
    INDEX idx_interview_status_history_date (created_at)
);

-- Update Messages table to link with conversations
ALTER TABLE messages 
ADD COLUMN conversation_id INT NULL,
ADD CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL;

-- Add indexes for better performance
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_type ON messages(message_type);
CREATE INDEX idx_messages_flagged ON messages(is_flagged);
CREATE INDEX idx_messages_created ON messages(created_at);

-- Add conversation relationship to interviews
ALTER TABLE conversations 
ADD CONSTRAINT fk_conversations_interview FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE SET NULL;

-- Create views for easier querying
CREATE VIEW interview_summary AS
SELECT 
    i.*,
    mp.user_id as manager_user_id,
    mu.first_name as manager_first_name,
    mu.last_name as manager_last_name,
    mu.email as manager_email,
    tp.user_id as talent_user_id,
    tu.first_name as talent_first_name,
    tu.last_name as talent_last_name,
    tu.email as talent_email,
    j.title as job_title,
    j.status as job_status,
    (SELECT COUNT(*) FROM interview_questions iq WHERE iq.interview_id = i.id) as total_questions,
    (SELECT COUNT(*) FROM interview_questions iq WHERE iq.interview_id = i.id AND iq.answered_at IS NOT NULL) as answered_questions
FROM interviews i
LEFT JOIN manager_profiles mp ON i.manager_id = mp.id
LEFT JOIN users mu ON mp.user_id = mu.id
LEFT JOIN talent_profiles tp ON i.talent_id = tp.id
LEFT JOIN users tu ON tp.user_id = tu.id
LEFT JOIN jobs j ON i.job_id = j.id
WHERE i.deleted_at IS NULL;

-- Create view for conversation summaries
CREATE VIEW conversation_summary AS
SELECT 
    c.*,
    u1.first_name as participant_1_first_name,
    u1.last_name as participant_1_last_name,
    u1.email as participant_1_email,
    u2.first_name as participant_2_first_name,
    u2.last_name as participant_2_last_name,
    u2.email as participant_2_email,
    j.title as job_title,
    i.title as interview_title,
    i.status as interview_status,
    (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as message_count,
    (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.is_read = FALSE) as unread_count
FROM conversations c
LEFT JOIN users u1 ON c.participant_1_id = u1.id
LEFT JOIN users u2 ON c.participant_2_id = u2.id
LEFT JOIN jobs j ON c.job_id = j.id
LEFT JOIN interviews i ON c.interview_id = i.id;