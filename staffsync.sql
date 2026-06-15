-- phpMyAdmin SQL Dump
-- StaffSync Database — clean seed (IT_ADMIN only)
-- Server version: 10.4.32-MariaDB

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";
/*!40101 SET NAMES utf8mb4 */;

-- --------------------------------------------------------
-- Database: `staffsync`
-- --------------------------------------------------------

CREATE TABLE `active_sessions` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED NOT NULL,
  `token_hash` varchar(64) NOT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(300) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `expires_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sessions_user` (`user_id`),
  KEY `idx_sessions_token` (`token_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `attendance` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED NOT NULL,
  `date` date NOT NULL,
  `status` enum('PRESENT','LATE','ABSENT','ON_LEAVE','HOLIDAY','WFH') NOT NULL DEFAULT 'ABSENT',
  `check_in` datetime DEFAULT NULL,
  `check_out` datetime DEFAULT NULL,
  `hours_worked` decimal(5,2) DEFAULT NULL,
  `method` enum('qr','manual','sync','regularise','override') NOT NULL DEFAULT 'qr',
  `qr_zone_id` int(10) UNSIGNED DEFAULT NULL,
  `lat` decimal(10,7) DEFAULT NULL,
  `lng` decimal(10,7) DEFAULT NULL,
  `face_verified` tinyint(1) NOT NULL DEFAULT 0,
  `note` varchar(300) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_attendance_user_date` (`user_id`,`date`),
  KEY `idx_attendance_date` (`date`),
  KEY `idx_attendance_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `audit_log` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED DEFAULT NULL,
  `action` varchar(200) NOT NULL,
  `detail` text DEFAULT NULL,
  `action_type` varchar(40) NOT NULL DEFAULT 'info',
  `status` enum('success','warn','error') NOT NULL DEFAULT 'success',
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_audit_user` (`user_id`),
  KEY `idx_audit_type` (`action_type`),
  KEY `idx_audit_status` (`status`),
  KEY `idx_audit_date` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `chat_channels` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `type` enum('dm','public','team') NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `avatar_url` varchar(255) DEFAULT NULL,
  `created_by` int(10) UNSIGNED NOT NULL,
  `task_id` int(10) UNSIGNED DEFAULT NULL,
  `is_archived` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `chat_members` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `channel_id` int(10) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `role` enum('member','admin') NOT NULL DEFAULT 'member',
  `joined_at` datetime NOT NULL DEFAULT current_timestamp(),
  `muted` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_chan_user` (`channel_id`,`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `chat_messages` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `channel_id` int(10) UNSIGNED NOT NULL,
  `sender_id` int(10) UNSIGNED NOT NULL,
  `body` text DEFAULT NULL,
  `attachment_url` varchar(512) DEFAULT NULL,
  `attachment_type` enum('image','video','doc','audio') DEFAULT NULL,
  `attachment_name` varchar(255) DEFAULT NULL,
  `reply_to_id` int(10) UNSIGNED DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_channel` (`channel_id`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `chat_reactions` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `message_id` int(10) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `emoji` varchar(10) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_msg_user_emoji` (`message_id`,`user_id`,`emoji`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `chat_reads` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `channel_id` int(10) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `last_read_message_id` int(10) UNSIGNED DEFAULT NULL,
  `last_read_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_chan_user` (`channel_id`,`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `chat_statuses` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED NOT NULL,
  `caption` varchar(255) DEFAULT NULL,
  `media_url` varchar(512) NOT NULL,
  `media_type` enum('image','video') NOT NULL DEFAULT 'image',
  `bg_color` varchar(20) DEFAULT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `chat_status_views` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `status_id` int(10) UNSIGNED NOT NULL,
  `viewer_id` int(10) UNSIGNED NOT NULL,
  `viewed_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_status_viewer` (`status_id`,`viewer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `deduction_templates` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `type` enum('percentage','fixed') NOT NULL DEFAULT 'percentage',
  `value` decimal(10,4) NOT NULL DEFAULT 0.0000,
  `applies_to` enum('all','individual') NOT NULL DEFAULT 'all',
  `is_mandatory` tinyint(1) NOT NULL DEFAULT 0,
  `description` text DEFAULT NULL,
  `created_by` int(10) UNSIGNED DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `face_descriptors` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED NOT NULL,
  `descriptor_enc` mediumtext NOT NULL,
  `gdpr_consent` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `fail_count` tinyint(4) NOT NULL DEFAULT 0,
  `locked_until` datetime DEFAULT NULL,
  `last_verified` datetime DEFAULT NULL,
  `enrolled_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  KEY `idx_face_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `geofence_breaches` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED NOT NULL,
  `zone_id` int(10) UNSIGNED NOT NULL,
  `lat` decimal(10,7) NOT NULL,
  `lng` decimal(10,7) NOT NULL,
  `distance_m` int(11) NOT NULL,
  `breach_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_breach_user` (`user_id`),
  KEY `idx_breach_at` (`breach_at`),
  KEY `fk_breach_zone` (`zone_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `gps_heartbeats` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED NOT NULL,
  `attendance_id` int(10) UNSIGNED DEFAULT NULL,
  `lat` decimal(10,7) NOT NULL,
  `lng` decimal(10,7) NOT NULL,
  `accuracy_m` smallint(5) UNSIGNED DEFAULT NULL,
  `zone_id` int(10) UNSIGNED DEFAULT NULL,
  `distance_m` int(11) DEFAULT NULL,
  `inside_zone` tinyint(1) NOT NULL DEFAULT 0,
  `status` enum('OK','OUT_OF_ZONE','NO_ZONE') NOT NULL DEFAULT 'OK',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_user_time` (`user_id`,`created_at`),
  KEY `idx_attendance` (`attendance_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `invites` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `email` varchar(180) NOT NULL,
  `full_name` varchar(120) NOT NULL DEFAULT '',
  `role` enum('EMPLOYEE','MANAGER','HR','IT_ADMIN') NOT NULL DEFAULT 'EMPLOYEE',
  `department` varchar(80) NOT NULL DEFAULT '',
  `token` varchar(128) NOT NULL,
  `status` enum('pending','accepted','expired','revoked') NOT NULL DEFAULT 'pending',
  `invited_by` int(10) UNSIGNED NOT NULL,
  `expires_at` datetime NOT NULL,
  `accepted_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `token` (`token`),
  KEY `idx_invite_token` (`token`),
  KEY `idx_invite_status` (`status`),
  KEY `fk_invite_by` (`invited_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `leave_balances` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED NOT NULL,
  `leave_type` varchar(60) NOT NULL,
  `year` year(4) NOT NULL,
  `entitlement` decimal(5,1) NOT NULL DEFAULT 0.0,
  `used` decimal(5,1) NOT NULL DEFAULT 0.0,
  `pending` decimal(5,1) NOT NULL DEFAULT 0.0,
  `remaining` decimal(5,1) GENERATED ALWAYS AS (`entitlement` - `used` - `pending`) STORED,
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_balance_user_type_year` (`user_id`,`leave_type`,`year`),
  KEY `idx_balance_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `leave_requests` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED NOT NULL,
  `type` varchar(60) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `days` tinyint(4) NOT NULL DEFAULT 1,
  `reason` varchar(500) NOT NULL DEFAULT '',
  `document_path` varchar(500) DEFAULT NULL,
  `status` enum('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  `approver_id` int(10) UNSIGNED DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `rejection_reason` varchar(300) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_leave_user` (`user_id`),
  KEY `idx_leave_status` (`status`),
  KEY `idx_leave_dates` (`start_date`,`end_date`),
  KEY `fk_leave_approver` (`approver_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `leave_types` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` varchar(60) NOT NULL,
  `days_per_year` tinyint(4) NOT NULL DEFAULT 0,
  `carry_forward` tinyint(1) NOT NULL DEFAULT 0,
  `max_carry_days` tinyint(4) NOT NULL DEFAULT 0,
  `requires_document` tinyint(1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `leave_types` (`name`, `days_per_year`, `carry_forward`, `max_carry_days`, `requires_document`, `is_active`) VALUES
('Annual Leave', 20, 1, 5, 0, 1),
('Sick Leave', 10, 0, 0, 1, 1),
('Casual Leave', 6, 0, 0, 0, 1),
('Maternity Leave', 90, 0, 0, 1, 1),
('Paternity Leave', 10, 0, 0, 0, 1),
('Unpaid Leave', 0, 0, 0, 0, 1);

CREATE TABLE `notifications` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED NOT NULL,
  `type` enum('info','success','warning','error','leave','attendance','task','face','qr') NOT NULL DEFAULT 'info',
  `title` varchar(120) NOT NULL,
  `message` text NOT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `read_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_notif_user` (`user_id`),
  KEY `idx_notif_read` (`is_read`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `password_resets` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED NOT NULL,
  `token` varchar(128) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `token` (`token`),
  KEY `idx_pwreset_token` (`token`),
  KEY `idx_pwreset_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `payroll_entries` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `run_id` int(10) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `basic_salary` decimal(14,2) NOT NULL DEFAULT 0.00,
  `overtime_hours` decimal(6,2) NOT NULL DEFAULT 0.00,
  `overtime_amount` decimal(14,2) NOT NULL DEFAULT 0.00,
  `bonus` decimal(14,2) NOT NULL DEFAULT 0.00,
  `gross` decimal(14,2) NOT NULL DEFAULT 0.00,
  `paye` decimal(14,2) NOT NULL DEFAULT 0.00,
  `rssb_pension` decimal(14,2) NOT NULL DEFAULT 0.00,
  `rssb_medical` decimal(14,2) NOT NULL DEFAULT 0.00,
  `brd_loan` decimal(14,2) NOT NULL DEFAULT 0.00,
  `other_deductions` decimal(14,2) NOT NULL DEFAULT 0.00,
  `total_deductions` decimal(14,2) NOT NULL DEFAULT 0.00,
  `net_pay` decimal(14,2) NOT NULL DEFAULT 0.00,
  `deduction_details` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`deduction_details`)),
  `adjusted_by` int(10) UNSIGNED DEFAULT NULL,
  `adjusted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_run_user` (`run_id`,`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `payroll_runs` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `period_label` varchar(30) NOT NULL,
  `period_start` date NOT NULL,
  `period_end` date NOT NULL,
  `status` enum('draft','processing','pending_manager','pending_hr','approved','rejected','paid') NOT NULL DEFAULT 'draft',
  `total_gross` decimal(16,2) NOT NULL DEFAULT 0.00,
  `total_deductions` decimal(16,2) NOT NULL DEFAULT 0.00,
  `total_net` decimal(16,2) NOT NULL DEFAULT 0.00,
  `employee_count` smallint(6) NOT NULL DEFAULT 0,
  `notes` text DEFAULT NULL,
  `rejection_reason` text DEFAULT NULL,
  `created_by` int(10) UNSIGNED NOT NULL,
  `approved_by_manager` int(10) UNSIGNED DEFAULT NULL,
  `approved_by_hr` int(10) UNSIGNED DEFAULT NULL,
  `finalized_by` int(10) UNSIGNED DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `processed_at` datetime DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `payslip_complaints` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `entry_id` int(10) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `subject` varchar(200) NOT NULL,
  `message` text NOT NULL,
  `status` enum('open','in_review','resolved') NOT NULL DEFAULT 'open',
  `reply` text DEFAULT NULL,
  `replied_by` int(10) UNSIGNED DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `resolved_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `policies` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `icon` varchar(10) NOT NULL DEFAULT '?',
  `color` varchar(10) NOT NULL DEFAULT '#6366f1',
  `version` varchar(10) NOT NULL DEFAULT 'v1.0',
  `status` varchar(20) NOT NULL DEFAULT 'published',
  `rules` longtext NOT NULL DEFAULT '[]',
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `policies` (`name`, `icon`, `color`, `version`, `status`, `rules`) VALUES
('Leave Policy', '📅', '#6366f1', 'v1.0', 'published', '[{"id":11,"label":"Annual leave entitlement","value":"20 days/year","editable":true},{"id":12,"label":"Sick leave entitlement","value":"10 days/year","editable":true},{"id":13,"label":"Casual leave entitlement","value":"5 days/year","editable":true},{"id":14,"label":"Min notice (annual leave)","value":"3 working days","editable":true},{"id":15,"label":"Max consecutive leave days","value":"14 days","editable":true},{"id":16,"label":"Carry-over allowed","value":"5 days max","editable":true}]'),
('Attendance Policy', '⏰', '#10b981', 'v1.0', 'published', '[{"id":21,"label":"Check-in window","value":"06:30 – 09:00","editable":true},{"id":22,"label":"Late threshold","value":"15 minutes","editable":true},{"id":23,"label":"Late = absent threshold","value":"3 lates/month","editable":true},{"id":24,"label":"WFH allowed","value":"Manager approval","editable":true},{"id":25,"label":"GPS monitoring hours","value":"Shift hours only","editable":false}]'),
('Face Biometric Policy', '🫡', '#a78bfa', 'v1.0', 'published', '[{"id":31,"label":"Enrollment required","value":"Yes — mandatory","editable":false},{"id":32,"label":"Enrollment deadline","value":"30 days from hire","editable":true},{"id":33,"label":"Liveness check","value":"Required (blink)","editable":false},{"id":34,"label":"Re-enrollment approval","value":"HR Officer","editable":true},{"id":35,"label":"GDPR consent required","value":"Yes","editable":false},{"id":36,"label":"Descriptor encryption","value":"AES-256","editable":false}]'),
('QR Check-in Policy', '📲', '#f59e0b', 'v1.0', 'draft', '[{"id":41,"label":"QR token rotation","value":"Every 30 seconds","editable":true},{"id":42,"label":"QR + Geofence required","value":"Yes — both layers","editable":false},{"id":43,"label":"Face verify required","value":"Yes — third layer","editable":false},{"id":44,"label":"Failure lockout","value":"3 attempts","editable":true}]');

CREATE TABLE `presence_status` (
  `user_id` int(10) UNSIGNED NOT NULL,
  `attendance_id` int(10) UNSIGNED DEFAULT NULL,
  `zone_id` int(10) UNSIGNED DEFAULT NULL,
  `last_heartbeat` datetime DEFAULT NULL,
  `last_lat` decimal(10,7) DEFAULT NULL,
  `last_lng` decimal(10,7) DEFAULT NULL,
  `last_dist_m` int(11) DEFAULT NULL,
  `inside_zone` tinyint(1) NOT NULL DEFAULT 0,
  `status` enum('CHECKED_IN','OUT_OF_ZONE','INACTIVE_SIGNAL','PRESENCE_DOUBT','EXEMPT','CHECKED_OUT') NOT NULL DEFAULT 'CHECKED_OUT',
  `exempt_reason` varchar(200) DEFAULT NULL,
  `flagged_at` datetime DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`user_id`),
  KEY `idx_status` (`status`),
  KEY `idx_updated` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `qr_scan_log` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `zone_id` int(10) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `token` varchar(100) NOT NULL,
  `lat` decimal(10,7) DEFAULT NULL,
  `lng` decimal(10,7) DEFAULT NULL,
  `geofence_pass` tinyint(1) NOT NULL DEFAULT 0,
  `face_verified` tinyint(1) NOT NULL DEFAULT 0,
  `scanned_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_scan_zone` (`zone_id`),
  KEY `idx_scan_user` (`user_id`),
  KEY `idx_scan_at` (`scanned_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `qr_zones` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` varchar(80) NOT NULL,
  `lat` decimal(10,7) NOT NULL,
  `lng` decimal(10,7) NOT NULL,
  `radius_m` smallint(6) NOT NULL DEFAULT 200,
  `grace_period_min` tinyint(4) NOT NULL DEFAULT 5,
  `current_token` varchar(100) DEFAULT NULL,
  `token_expires_at` datetime DEFAULT NULL,
  `rotate_seconds` smallint(6) NOT NULL DEFAULT 30,
  `scan_count` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_qr_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `regularisation_requests` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED NOT NULL,
  `date` date NOT NULL,
  `reason` varchar(500) NOT NULL,
  `requested_status` enum('PRESENT','LATE','WFH') NOT NULL DEFAULT 'PRESENT',
  `check_in` time DEFAULT NULL,
  `check_out` time DEFAULT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `reviewed_by` int(10) UNSIGNED DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `review_note` varchar(300) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_reg_user` (`user_id`),
  KEY `idx_reg_status` (`status`),
  KEY `fk_reg_reviewer` (`reviewed_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `salary_configs` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED NOT NULL,
  `basic_salary` decimal(14,2) NOT NULL DEFAULT 0.00,
  `currency` varchar(5) NOT NULL DEFAULT 'RWF',
  `pay_frequency` enum('monthly','biweekly') NOT NULL DEFAULT 'monthly',
  `has_brd_loan` tinyint(1) NOT NULL DEFAULT 0,
  `overtime_rate` decimal(5,2) NOT NULL DEFAULT 1.50,
  `effective_from` date NOT NULL DEFAULT curdate(),
  `notes` text DEFAULT NULL,
  `created_by` int(10) UNSIGNED DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `shifts` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `start_time` time NOT NULL DEFAULT '09:00:00',
  `end_time` time NOT NULL DEFAULT '17:00:00',
  `days_of_week` varchar(20) NOT NULL DEFAULT '1,2,3,4,5',
  `grace_minutes` smallint(6) NOT NULL DEFAULT 15,
  `color` varchar(10) NOT NULL DEFAULT '#6366f1',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` int(10) UNSIGNED DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `shift_holidays` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `shift_id` int(10) UNSIGNED DEFAULT NULL,
  `name` varchar(100) NOT NULL,
  `date` date NOT NULL,
  `type` enum('public','company','optional') NOT NULL DEFAULT 'public',
  `created_by` int(10) UNSIGNED DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_shift_date` (`shift_id`,`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `shift_members` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `shift_id` int(10) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `assigned_at` datetime NOT NULL DEFAULT current_timestamp(),
  `assigned_by` int(10) UNSIGNED DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_shift_user` (`shift_id`,`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `subtasks` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `task_id` int(10) UNSIGNED NOT NULL,
  `label` varchar(200) NOT NULL,
  `is_done` tinyint(1) NOT NULL DEFAULT 0,
  `sort_order` tinyint(4) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_subtask_task` (`task_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `sync_log` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `type` enum('manual','scheduled','auto') NOT NULL DEFAULT 'manual',
  `records_synced` int(11) NOT NULL DEFAULT 0,
  `conflicts` int(11) NOT NULL DEFAULT 0,
  `duration_sec` decimal(8,3) NOT NULL DEFAULT 0.000,
  `status` enum('success','partial','error') NOT NULL DEFAULT 'success',
  `error_message` text DEFAULT NULL,
  `started_at` datetime NOT NULL DEFAULT current_timestamp(),
  `completed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sync_started` (`started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tasks` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` varchar(200) NOT NULL,
  `description` text DEFAULT NULL,
  `priority` enum('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'MEDIUM',
  `status` enum('TODO','IN_PROGRESS','REVIEW','DONE','BLOCKED') NOT NULL DEFAULT 'TODO',
  `assignee_id` int(10) UNSIGNED NOT NULL,
  `created_by` int(10) UNSIGNED NOT NULL,
  `due_date` date DEFAULT NULL,
  `tags` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`tags`)),
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  `team_id` int(10) UNSIGNED DEFAULT NULL,
  `progress_pct` tinyint(3) UNSIGNED DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_task_assignee` (`assignee_id`),
  KEY `idx_task_status` (`status`),
  KEY `idx_task_due` (`due_date`),
  KEY `fk_task_creator` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `task_comments` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `task_id` int(10) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `text` text NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_comment_task` (`task_id`),
  KEY `fk_comment_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `teams` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `description` text DEFAULT NULL,
  `department` varchar(80) DEFAULT NULL,
  `manager_id` int(10) UNSIGNED NOT NULL,
  `color` varchar(7) DEFAULT '#6366f1',
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_manager` (`manager_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `team_members` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `team_id` int(10) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `role_tag` varchar(40) DEFAULT 'member',
  `added_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_team_user` (`team_id`,`user_id`),
  KEY `idx_team` (`team_id`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `users` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id` varchar(20) NOT NULL,
  `full_name` varchar(120) NOT NULL,
  `email` varchar(180) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('EMPLOYEE','MANAGER','HR','IT_ADMIN','FINANCE','SYSTEM') NOT NULL DEFAULT 'EMPLOYEE',
  `department` varchar(80) NOT NULL DEFAULT '',
  `job_title` varchar(100) NOT NULL DEFAULT '',
  `phone` varchar(30) NOT NULL DEFAULT '',
  `avatar_url` varchar(500) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `face_enrolled` tinyint(1) NOT NULL DEFAULT 0,
  `failed_logins` tinyint(4) NOT NULL DEFAULT 0,
  `locked_until` datetime DEFAULT NULL,
  `shift_start` time NOT NULL DEFAULT '09:00:00',
  `shift_end` time NOT NULL DEFAULT '17:00:00',
  `gdpr_consent` tinyint(1) NOT NULL DEFAULT 0,
  `gdpr_consent_at` datetime DEFAULT NULL,
  `last_login` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_id` (`employee_id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_users_role` (`role`),
  KEY `idx_users_dept` (`department`),
  KEY `idx_users_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed: IT_ADMIN only — password is Admin@1234
INSERT INTO `users` (`employee_id`, `full_name`, `email`, `password_hash`, `role`, `department`, `job_title`, `is_active`, `face_enrolled`, `gdpr_consent`, `created_at`) VALUES
('EMP-001', 'Admin User', 'admin@devx.com', '$2y$12$.mGfnA1WwqZo0RBpLUyqC.1m2R7px/0UiTWhFiYCkowigyI6HJiPa', 'IT_ADMIN', 'IT', 'System Administrator', 1, 0, 1, NOW());

-- Foreign key constraints
ALTER TABLE `active_sessions`   ADD CONSTRAINT `fk_sessions_user`  FOREIGN KEY (`user_id`)     REFERENCES `users` (`id`) ON DELETE CASCADE;
ALTER TABLE `attendance`        ADD CONSTRAINT `fk_att_user`        FOREIGN KEY (`user_id`)     REFERENCES `users` (`id`) ON DELETE CASCADE;
ALTER TABLE `face_descriptors`  ADD CONSTRAINT `fk_face_user`       FOREIGN KEY (`user_id`)     REFERENCES `users` (`id`) ON DELETE CASCADE;
ALTER TABLE `geofence_breaches` ADD CONSTRAINT `fk_breach_user`     FOREIGN KEY (`user_id`)     REFERENCES `users` (`id`) ON DELETE CASCADE;
ALTER TABLE `geofence_breaches` ADD CONSTRAINT `fk_breach_zone`     FOREIGN KEY (`zone_id`)     REFERENCES `qr_zones` (`id`);
ALTER TABLE `invites`           ADD CONSTRAINT `fk_invite_by`       FOREIGN KEY (`invited_by`)  REFERENCES `users` (`id`);
ALTER TABLE `leave_balances`    ADD CONSTRAINT `fk_balance_user`    FOREIGN KEY (`user_id`)     REFERENCES `users` (`id`) ON DELETE CASCADE;
ALTER TABLE `leave_requests`    ADD CONSTRAINT `fk_leave_approver`  FOREIGN KEY (`approver_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;
ALTER TABLE `leave_requests`    ADD CONSTRAINT `fk_leave_user`      FOREIGN KEY (`user_id`)     REFERENCES `users` (`id`) ON DELETE CASCADE;
ALTER TABLE `notifications`     ADD CONSTRAINT `fk_notif_user`      FOREIGN KEY (`user_id`)     REFERENCES `users` (`id`) ON DELETE CASCADE;
ALTER TABLE `password_resets`   ADD CONSTRAINT `fk_pwreset_user`    FOREIGN KEY (`user_id`)     REFERENCES `users` (`id`) ON DELETE CASCADE;
ALTER TABLE `qr_scan_log`       ADD CONSTRAINT `fk_scan_user`       FOREIGN KEY (`user_id`)     REFERENCES `users` (`id`) ON DELETE CASCADE;
ALTER TABLE `qr_scan_log`       ADD CONSTRAINT `fk_scan_zone`       FOREIGN KEY (`zone_id`)     REFERENCES `qr_zones` (`id`);
ALTER TABLE `regularisation_requests` ADD CONSTRAINT `fk_reg_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;
ALTER TABLE `regularisation_requests` ADD CONSTRAINT `fk_reg_user`     FOREIGN KEY (`user_id`)     REFERENCES `users` (`id`) ON DELETE CASCADE;
ALTER TABLE `subtasks`          ADD CONSTRAINT `fk_subtask_task`    FOREIGN KEY (`task_id`)     REFERENCES `tasks` (`id`) ON DELETE CASCADE;
ALTER TABLE `tasks`             ADD CONSTRAINT `fk_task_assignee`   FOREIGN KEY (`assignee_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;
ALTER TABLE `tasks`             ADD CONSTRAINT `fk_task_creator`    FOREIGN KEY (`created_by`)  REFERENCES `users` (`id`);
ALTER TABLE `task_comments`     ADD CONSTRAINT `fk_comment_task`    FOREIGN KEY (`task_id`)     REFERENCES `tasks` (`id`) ON DELETE CASCADE;
ALTER TABLE `task_comments`     ADD CONSTRAINT `fk_comment_user`    FOREIGN KEY (`user_id`)     REFERENCES `users` (`id`) ON DELETE CASCADE;

COMMIT;
