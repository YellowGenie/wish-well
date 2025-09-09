-- Create interviews table
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

-- Add conversation relationship to interviews
ALTER TABLE conversations 
ADD CONSTRAINT fk_conversations_interview FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE SET NULL;

-- Create view for interview summaries
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