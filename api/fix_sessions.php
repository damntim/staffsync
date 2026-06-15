<?php
/**
 * Clears stale active_sessions rows (old token format), then verifies column is correct.
 * Visit once: http://localhost/staff_cecile/api/fix_sessions.php
 */
require_once __DIR__ . '/config.php';

// Wipe all sessions — users will re-login with correct token_hash format
db()->exec('TRUNCATE TABLE active_sessions');

// Confirm column type
$col = db()->query("SHOW COLUMNS FROM active_sessions LIKE 'token_hash'")->fetch();

echo json_encode([
    'ok'     => true,
    'msg'    => 'Sessions cleared. Please log in again.',
    'column' => $col ?: 'not found — run migrate_sessions.php first',
]);
