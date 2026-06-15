<?php
/**
 * One-time migration: rename active_sessions.token → token_hash
 * Visit http://localhost/staff_cecile/api/migrate_sessions.php once, then delete this file.
 */
require_once __DIR__ . '/config.php';

try {
    // Check if column already named token_hash
    $cols = db()->query("SHOW COLUMNS FROM active_sessions LIKE 'token_hash'")->fetchAll();
    if ($cols) {
        echo json_encode(['ok' => true, 'msg' => 'Column already named token_hash — nothing to do']);
        exit;
    }

    // Check if old 'token' column exists
    $old = db()->query("SHOW COLUMNS FROM active_sessions LIKE 'token'")->fetchAll();
    if ($old) {
        db()->exec("ALTER TABLE active_sessions CHANGE COLUMN `token` `token_hash` VARCHAR(64) NOT NULL");
        db()->exec("ALTER TABLE active_sessions MODIFY COLUMN `token_hash` VARCHAR(64) NOT NULL");
        echo json_encode(['ok' => true, 'msg' => 'Renamed token → token_hash']);
    } else {
        // Table might not have the column at all — add it
        db()->exec("ALTER TABLE active_sessions ADD COLUMN `token_hash` VARCHAR(64) NOT NULL AFTER `user_id`");
        echo json_encode(['ok' => true, 'msg' => 'Added token_hash column']);
    }
} catch (Throwable $e) {
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
}
