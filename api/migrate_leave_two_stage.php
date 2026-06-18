<?php
/**
 * StaffSync — migration: two-stage leave approval (Manager + HR, both required).
 * Run once:  http://localhost/staff_cecile/api/migrate_leave_two_stage.php
 *
 * Adds separate manager & HR sign-off columns so a leave is only APPROVED when
 * BOTH have approved (in any order). Either rejecting marks the request rejected.
 */
require_once __DIR__ . '/config.php';

header('Content-Type: text/plain');

$cols = [
    // Manager stage
    "manager_status   ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending'",
    "manager_id       INT UNSIGNED NULL",
    "manager_note     VARCHAR(500) NULL",
    "manager_acted_at DATETIME NULL",
    // HR stage
    "hr_status        ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending'",
    "hr_id            INT UNSIGNED NULL",
    "hr_note          VARCHAR(500) NULL",
    "hr_acted_at      DATETIME NULL",
];

foreach ($cols as $def) {
    $name = explode(' ', trim($def))[0];
    $exists = db()->query("SHOW COLUMNS FROM leave_requests LIKE '$name'")->fetch();
    if ($exists) {
        echo "• $name already exists — skipped\n";
        continue;
    }
    db()->exec("ALTER TABLE leave_requests ADD COLUMN $def");
    echo "✓ added $name\n";
}

// Backfill: any already-approved/rejected request → set both stages to that
// final state so old data stays consistent with the new model.
db()->exec("UPDATE leave_requests SET manager_status='approved', hr_status='approved'
            WHERE status='approved' AND manager_status='pending'");
db()->exec("UPDATE leave_requests SET manager_status='rejected', hr_status='rejected'
            WHERE status='rejected' AND manager_status='pending'");

echo "\nDone. Leave approval is now two-stage (Manager + HR).\n";
