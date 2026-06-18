-- StaffSync — reset to clean state: keep ONLY the IT_ADMIN user, wipe everything else.
-- Run:  mysql -u root staffsync < api/reset_db.sql
-- The IT_ADMIN account kept: admin@devx.com (role = IT_ADMIN)

SET FOREIGN_KEY_CHECKS = 0;

-- Operational / transactional tables — fully cleared
TRUNCATE TABLE active_sessions;
TRUNCATE TABLE attendance;
TRUNCATE TABLE audit_log;
TRUNCATE TABLE chat_reactions;
TRUNCATE TABLE chat_reads;
TRUNCATE TABLE chat_status_views;
TRUNCATE TABLE chat_statuses;
TRUNCATE TABLE chat_messages;
TRUNCATE TABLE chat_members;
TRUNCATE TABLE chat_channels;
TRUNCATE TABLE deduction_templates;
TRUNCATE TABLE face_descriptors;
TRUNCATE TABLE geofence_breaches;
TRUNCATE TABLE gps_heartbeats;
TRUNCATE TABLE invites;
TRUNCATE TABLE leave_balances;
TRUNCATE TABLE leave_requests;
TRUNCATE TABLE notifications;
TRUNCATE TABLE password_resets;
TRUNCATE TABLE payroll_entries;
TRUNCATE TABLE payroll_runs;
TRUNCATE TABLE payslip_complaints;
TRUNCATE TABLE presence_status;
TRUNCATE TABLE qr_scan_log;
TRUNCATE TABLE regularisation_requests;
TRUNCATE TABLE salary_configs;
TRUNCATE TABLE subtasks;
TRUNCATE TABLE sync_log;
TRUNCATE TABLE task_comments;
TRUNCATE TABLE tasks;
TRUNCATE TABLE shift_holidays;
TRUNCATE TABLE shift_members;
TRUNCATE TABLE shifts;
TRUNCATE TABLE team_members;
TRUNCATE TABLE teams;

-- Keep all users EXCEPT the IT_ADMIN
DELETE FROM users WHERE role <> 'IT_ADMIN';

-- Config / reference tables kept intact: leave_types, policies, qr_zones
-- (these are setup data, not user-generated). Remove the next 3 lines if you
-- also want those reset to empty.
-- TRUNCATE TABLE leave_types;
-- TRUNCATE TABLE policies;
-- TRUNCATE TABLE qr_zones;

SET FOREIGN_KEY_CHECKS = 1;

SELECT id, email, role, full_name FROM users;
