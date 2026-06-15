-- ============================================================
-- StaffSync v4.0 — MySQL Schema
-- Database: staffsync
-- Charset:  utf8mb4_unicode_ci
-- ============================================================

CREATE DATABASE IF NOT EXISTS `staffsync`
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE `staffsync`;

-- ============================================================
-- 1. USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS `users` (
    `id`                INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `employee_id`       VARCHAR(20)     NOT NULL UNIQUE,              -- EMP-001
    `full_name`         VARCHAR(120)    NOT NULL,
    `email`             VARCHAR(180)    NOT NULL UNIQUE,
    `password_hash`     VARCHAR(255)    NOT NULL,
    `role`              ENUM('EMPLOYEE','MANAGER','HR_OFFICER','HR_ADMIN','IT_ADMIN')
                                        NOT NULL DEFAULT 'EMPLOYEE',
    `department`        VARCHAR(80)     NOT NULL DEFAULT '',
    `job_title`         VARCHAR(100)    NOT NULL DEFAULT '',
    `phone`             VARCHAR(30)     NOT NULL DEFAULT '',
    `avatar_url`        VARCHAR(500)    NULL,
    `is_active`         TINYINT(1)      NOT NULL DEFAULT 1,
    `face_enrolled`     TINYINT(1)      NOT NULL DEFAULT 0,
    `failed_logins`     TINYINT         NOT NULL DEFAULT 0,
    `locked_until`      DATETIME        NULL,
    `shift_start`       TIME            NOT NULL DEFAULT '09:00:00',
    `shift_end`         TIME            NOT NULL DEFAULT '17:00:00',
    `gdpr_consent`      TINYINT(1)      NOT NULL DEFAULT 0,
    `gdpr_consent_at`   DATETIME        NULL,
    `last_login`        DATETIME        NULL,
    `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`        DATETIME        NULL ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_users_role`       (`role`),
    INDEX `idx_users_dept`       (`department`),
    INDEX `idx_users_active`     (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. ACTIVE SESSIONS  (server-side JWT revocation)
-- ============================================================
CREATE TABLE IF NOT EXISTS `active_sessions` (
    `id`            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `user_id`       INT UNSIGNED    NOT NULL,
    `token_hash`    VARCHAR(64)     NOT NULL,   -- SHA-256 hex of the JWT
    `ip_address`    VARCHAR(45)     NULL,
    `user_agent`    VARCHAR(300)    NULL,
    `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `expires_at`    DATETIME        NOT NULL,
    PRIMARY KEY (`id`),
    INDEX `idx_sessions_user`  (`user_id`),
    INDEX `idx_sessions_token` (`token_hash`),
    CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. FACE DESCRIPTORS  (AES-256-CBC encrypted 128D vectors)
-- ============================================================
CREATE TABLE IF NOT EXISTS `face_descriptors` (
    `id`                INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `user_id`           INT UNSIGNED    NOT NULL UNIQUE,
    `descriptor_enc`    MEDIUMTEXT      NOT NULL,  -- base64(AES-256-CBC(JSON 128D array))
    `fail_count`        TINYINT         NOT NULL DEFAULT 0,
    `locked_until`      DATETIME        NULL,
    `last_verified`     DATETIME        NULL,
    `enrolled_at`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`        DATETIME        NULL ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_face_user` (`user_id`),
    CONSTRAINT `fk_face_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. INVITES
-- ============================================================
CREATE TABLE IF NOT EXISTS `invites` (
    `id`            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `email`         VARCHAR(180)    NOT NULL,
    `full_name`     VARCHAR(120)    NOT NULL DEFAULT '',
    `role`          ENUM('EMPLOYEE','MANAGER','HR_OFFICER','HR_ADMIN','IT_ADMIN')
                                    NOT NULL DEFAULT 'EMPLOYEE',
    `department`    VARCHAR(80)     NOT NULL DEFAULT '',
    `token`         VARCHAR(128)    NOT NULL UNIQUE,
    `status`        ENUM('pending','accepted','expired','revoked')
                                    NOT NULL DEFAULT 'pending',
    `invited_by`    INT UNSIGNED    NOT NULL,
    `expires_at`    DATETIME        NOT NULL,
    `accepted_at`   DATETIME        NULL,
    `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_invite_token`  (`token`),
    INDEX `idx_invite_status` (`status`),
    CONSTRAINT `fk_invite_by` FOREIGN KEY (`invited_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. PASSWORD RESETS
-- ============================================================
CREATE TABLE IF NOT EXISTS `password_resets` (
    `id`            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `user_id`       INT UNSIGNED    NOT NULL,
    `token`         VARCHAR(128)    NOT NULL UNIQUE,
    `expires_at`    DATETIME        NOT NULL,
    `used`          TINYINT(1)      NOT NULL DEFAULT 0,
    `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_pwreset_token`  (`token`),
    INDEX `idx_pwreset_user`   (`user_id`),
    CONSTRAINT `fk_pwreset_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 6. ATTENDANCE
-- ============================================================
CREATE TABLE IF NOT EXISTS `attendance` (
    `id`                INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `user_id`           INT UNSIGNED    NOT NULL,
    `date`              DATE            NOT NULL,
    `status`            ENUM('PRESENT','LATE','ABSENT','ON_LEAVE','HOLIDAY','WFH')
                                        NOT NULL DEFAULT 'ABSENT',
    `check_in`          DATETIME        NULL,
    `check_out`         DATETIME        NULL,
    `hours_worked`      DECIMAL(5,2)    NULL,
    `method`            ENUM('qr','manual','sync','regularise','override')
                                        NOT NULL DEFAULT 'qr',
    `qr_zone_id`        INT UNSIGNED    NULL,
    `lat`               DECIMAL(10,7)   NULL,
    `lng`               DECIMAL(10,7)   NULL,
    `face_verified`     TINYINT(1)      NOT NULL DEFAULT 0,
    `note`              VARCHAR(300)    NULL,
    `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`        DATETIME        NULL ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_attendance_user_date` (`user_id`, `date`),
    INDEX `idx_attendance_date`   (`date`),
    INDEX `idx_attendance_status` (`status`),
    CONSTRAINT `fk_att_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 7. REGULARISATION REQUESTS  (correction requests for missed check-in)
-- ============================================================
CREATE TABLE IF NOT EXISTS `regularisation_requests` (
    `id`            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `user_id`       INT UNSIGNED    NOT NULL,
    `date`          DATE            NOT NULL,
    `reason`        VARCHAR(500)    NOT NULL,
    `requested_status` ENUM('PRESENT','LATE','WFH') NOT NULL DEFAULT 'PRESENT',
    `check_in`      TIME            NULL,
    `check_out`     TIME            NULL,
    `status`        ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    `reviewed_by`   INT UNSIGNED    NULL,
    `reviewed_at`   DATETIME        NULL,
    `review_note`   VARCHAR(300)    NULL,
    `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_reg_user`   (`user_id`),
    INDEX `idx_reg_status` (`status`),
    CONSTRAINT `fk_reg_user`      FOREIGN KEY (`user_id`)    REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_reg_reviewer`  FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 8. LEAVE TYPES  (configurable by HR)
-- ============================================================
CREATE TABLE IF NOT EXISTS `leave_types` (
    `id`                INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `name`              VARCHAR(60)     NOT NULL UNIQUE,   -- Annual, Sick, Casual…
    `days_per_year`     TINYINT         NOT NULL DEFAULT 0,
    `carry_forward`     TINYINT(1)      NOT NULL DEFAULT 0,
    `max_carry_days`    TINYINT         NOT NULL DEFAULT 0,
    `requires_document` TINYINT(1)      NOT NULL DEFAULT 0,
    `is_active`         TINYINT(1)      NOT NULL DEFAULT 1,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 9. LEAVE BALANCES
-- ============================================================
CREATE TABLE IF NOT EXISTS `leave_balances` (
    `id`            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `user_id`       INT UNSIGNED    NOT NULL,
    `leave_type`    VARCHAR(60)     NOT NULL,
    `year`          YEAR            NOT NULL,
    `entitlement`   DECIMAL(5,1)    NOT NULL DEFAULT 0,
    `used`          DECIMAL(5,1)    NOT NULL DEFAULT 0,
    `pending`       DECIMAL(5,1)    NOT NULL DEFAULT 0,
    `remaining`     DECIMAL(5,1)    GENERATED ALWAYS AS (`entitlement` - `used` - `pending`) STORED,
    `updated_at`    DATETIME        NULL ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_balance_user_type_year` (`user_id`, `leave_type`, `year`),
    INDEX `idx_balance_user` (`user_id`),
    CONSTRAINT `fk_balance_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 10. LEAVE REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS `leave_requests` (
    `id`                INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `user_id`           INT UNSIGNED    NOT NULL,
    `type`              VARCHAR(60)     NOT NULL,
    `start_date`        DATE            NOT NULL,
    `end_date`          DATE            NOT NULL,
    `days`              TINYINT         NOT NULL DEFAULT 1,
    `reason`            VARCHAR(500)    NOT NULL DEFAULT '',
    `document_path`     VARCHAR(500)    NULL,
    `status`            ENUM('pending','approved','rejected','cancelled')
                                        NOT NULL DEFAULT 'pending',
    `approver_id`       INT UNSIGNED    NULL,
    `approved_at`       DATETIME        NULL,
    `rejection_reason`  VARCHAR(300)    NULL,
    `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`        DATETIME        NULL ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_leave_user`    (`user_id`),
    INDEX `idx_leave_status`  (`status`),
    INDEX `idx_leave_dates`   (`start_date`, `end_date`),
    CONSTRAINT `fk_leave_user`     FOREIGN KEY (`user_id`)    REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_leave_approver` FOREIGN KEY (`approver_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 11. QR ZONES (office locations with geofence)
-- ============================================================
CREATE TABLE IF NOT EXISTS `qr_zones` (
    `id`                INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `name`              VARCHAR(80)     NOT NULL,
    `lat`               DECIMAL(10,7)   NOT NULL,
    `lng`               DECIMAL(10,7)   NOT NULL,
    `radius_m`          SMALLINT        NOT NULL DEFAULT 200,   -- metres
    `grace_period_min`  TINYINT         NOT NULL DEFAULT 5,
    `current_token`     VARCHAR(100)    NULL,
    `token_expires_at`  DATETIME        NULL,
    `rotate_seconds`    SMALLINT        NOT NULL DEFAULT 30,
    `scan_count`        INT UNSIGNED    NOT NULL DEFAULT 0,
    `is_active`         TINYINT(1)      NOT NULL DEFAULT 1,
    `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`        DATETIME        NULL ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_qr_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 12. QR SCAN LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS `qr_scan_log` (
    `id`                INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `zone_id`           INT UNSIGNED    NOT NULL,
    `user_id`           INT UNSIGNED    NOT NULL,
    `token`             VARCHAR(100)    NOT NULL,
    `lat`               DECIMAL(10,7)   NULL,
    `lng`               DECIMAL(10,7)   NULL,
    `geofence_pass`     TINYINT(1)      NOT NULL DEFAULT 0,
    `face_verified`     TINYINT(1)      NOT NULL DEFAULT 0,
    `scanned_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_scan_zone`  (`zone_id`),
    INDEX `idx_scan_user`  (`user_id`),
    INDEX `idx_scan_at`    (`scanned_at`),
    CONSTRAINT `fk_scan_zone` FOREIGN KEY (`zone_id`) REFERENCES `qr_zones` (`id`),
    CONSTRAINT `fk_scan_user` FOREIGN KEY (`user_id`) REFERENCES `users`    (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 13. TASKS
-- ============================================================
CREATE TABLE IF NOT EXISTS `tasks` (
    `id`            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `title`         VARCHAR(200)    NOT NULL,
    `description`   TEXT            NULL,
    `priority`      ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'MEDIUM',
    `status`        ENUM('TODO','IN_PROGRESS','REVIEW','DONE','BLOCKED') NOT NULL DEFAULT 'TODO',
    `assignee_id`   INT UNSIGNED    NOT NULL,
    `created_by`    INT UNSIGNED    NOT NULL,
    `due_date`      DATE            NULL,
    `tags`          JSON            NULL,
    `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    DATETIME        NULL ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_task_assignee` (`assignee_id`),
    INDEX `idx_task_status`   (`status`),
    INDEX `idx_task_due`      (`due_date`),
    CONSTRAINT `fk_task_assignee` FOREIGN KEY (`assignee_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_task_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 14. SUBTASKS
-- ============================================================
CREATE TABLE IF NOT EXISTS `subtasks` (
    `id`            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `task_id`       INT UNSIGNED    NOT NULL,
    `label`         VARCHAR(200)    NOT NULL,
    `is_done`       TINYINT(1)      NOT NULL DEFAULT 0,
    `sort_order`    TINYINT         NOT NULL DEFAULT 0,
    `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    DATETIME        NULL ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_subtask_task` (`task_id`),
    CONSTRAINT `fk_subtask_task` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 15. TASK COMMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS `task_comments` (
    `id`            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `task_id`       INT UNSIGNED    NOT NULL,
    `user_id`       INT UNSIGNED    NOT NULL,
    `text`          TEXT            NOT NULL,
    `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_comment_task` (`task_id`),
    CONSTRAINT `fk_comment_task` FOREIGN KEY (`task_id`) REFERENCES `tasks`  (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_comment_user` FOREIGN KEY (`user_id`) REFERENCES `users`  (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 16. AUDIT LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS `audit_log` (
    `id`            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `user_id`       INT UNSIGNED    NULL,
    `action`        VARCHAR(200)    NOT NULL,
    `detail`        TEXT            NULL,
    `action_type`   VARCHAR(40)     NOT NULL DEFAULT 'info',
    `status`        ENUM('success','warn','error') NOT NULL DEFAULT 'success',
    `ip_address`    VARCHAR(45)     NULL,
    `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_audit_user`   (`user_id`),
    INDEX `idx_audit_type`   (`action_type`),
    INDEX `idx_audit_status` (`status`),
    INDEX `idx_audit_date`   (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 17. SYNC LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS `sync_log` (
    `id`                INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `type`              ENUM('manual','scheduled','auto') NOT NULL DEFAULT 'manual',
    `records_synced`    INT             NOT NULL DEFAULT 0,
    `conflicts`         INT             NOT NULL DEFAULT 0,
    `duration_sec`      DECIMAL(8,3)    NOT NULL DEFAULT 0,
    `status`            ENUM('success','partial','error') NOT NULL DEFAULT 'success',
    `error_message`     TEXT            NULL,
    `started_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `completed_at`      DATETIME        NULL,
    PRIMARY KEY (`id`),
    INDEX `idx_sync_started` (`started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 18. NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS `notifications` (
    `id`            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `user_id`       INT UNSIGNED    NOT NULL,
    `type`          ENUM('info','success','warning','error','leave','attendance','task','face','qr')
                                    NOT NULL DEFAULT 'info',
    `title`         VARCHAR(120)    NOT NULL,
    `message`       TEXT            NOT NULL,
    `is_read`       TINYINT(1)      NOT NULL DEFAULT 0,
    `read_at`       DATETIME        NULL,
    `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_notif_user` (`user_id`),
    INDEX `idx_notif_read` (`is_read`),
    CONSTRAINT `fk_notif_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 19. GEOFENCE BREACH LOG  (for detailed audit)
-- ============================================================
CREATE TABLE IF NOT EXISTS `geofence_breaches` (
    `id`            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `user_id`       INT UNSIGNED    NOT NULL,
    `zone_id`       INT UNSIGNED    NOT NULL,
    `lat`           DECIMAL(10,7)   NOT NULL,
    `lng`           DECIMAL(10,7)   NOT NULL,
    `distance_m`    INT             NOT NULL,
    `breach_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_breach_user` (`user_id`),
    INDEX `idx_breach_at`   (`breach_at`),
    CONSTRAINT `fk_breach_user` FOREIGN KEY (`user_id`) REFERENCES `users`     (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_breach_zone` FOREIGN KEY (`zone_id`) REFERENCES `qr_zones`  (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SEED DATA — default leave types
-- ============================================================
INSERT IGNORE INTO `leave_types` (`name`, `days_per_year`, `carry_forward`, `max_carry_days`, `requires_document`) VALUES
    ('Annual Leave',   20, 1, 5, 0),
    ('Sick Leave',     10, 0, 0, 1),
    ('Casual Leave',    6, 0, 0, 0),
    ('Maternity Leave',90, 0, 0, 1),
    ('Paternity Leave',10, 0, 0, 0),
    ('Unpaid Leave',    0, 0, 0, 0);

-- ============================================================
-- SEED DATA — default QR zone (DevX Ltd HQ)
-- ============================================================
INSERT IGNORE INTO `qr_zones` (`id`, `name`, `lat`, `lng`, `radius_m`, `grace_period_min`, `is_active`) VALUES
    (1, 'DevX Ltd HQ', -1.9441, 30.0619, 200, 5, 1);

-- ============================================================
-- SEED DATA — IT Admin bootstrap account
-- Password: Admin@1234  (bcrypt, cost=12)
-- Change immediately after first login!
-- ============================================================
INSERT IGNORE INTO `users`
    (`employee_id`, `full_name`, `email`, `password_hash`, `role`, `department`, `job_title`, `is_active`, `gdpr_consent`, `gdpr_consent_at`)
VALUES (
    'EMP-000',
    'System Administrator',
    'admin@devx.com',
    '$2y$12$A2Wm1xPz2/a03I.Szq3KYOoAGT.Ng/ap86rSkBokUmBG7MN1XB8bS',
    'IT_ADMIN',
    'IT',
    'System Administrator',
    1,
    1,
    NOW()
);

-- ============================================================
-- SEED — Leave balances for admin bootstrap (year 2026)
-- ============================================================
INSERT IGNORE INTO `leave_balances` (`user_id`, `leave_type`, `year`, `entitlement`, `used`, `pending`)
SELECT id, 'Annual Leave', YEAR(NOW()), 20, 0, 0
FROM `users` WHERE `employee_id` = 'EMP-000';

INSERT IGNORE INTO `leave_balances` (`user_id`, `leave_type`, `year`, `entitlement`, `used`, `pending`)
SELECT id, 'Sick Leave', YEAR(NOW()), 10, 0, 0
FROM `users` WHERE `employee_id` = 'EMP-000';
