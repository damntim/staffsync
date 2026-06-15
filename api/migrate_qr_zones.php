<?php
/**
 * One-time migration: align qr_zones table with what qr.php expects.
 * Run once at: http://localhost/staff_cecile/api/migrate_qr_zones.php
 */
require_once __DIR__ . '/config.php';

$pdo = db();
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$changes = [];

function col_exists(PDO $pdo, string $table, string $col): bool {
    $r = $pdo->query("SHOW COLUMNS FROM `$table` LIKE '$col'");
    return (bool)$r->fetch();
}

// 1. Add `address` if missing
if (!col_exists($pdo, 'qr_zones', 'address')) {
    $pdo->exec("ALTER TABLE qr_zones ADD COLUMN `address` VARCHAR(200) NULL AFTER `name`");
    $changes[] = "Added column: address";
}

// 2. Add `latitude` (copy from `lat`) if missing
if (!col_exists($pdo, 'qr_zones', 'latitude')) {
    $pdo->exec("ALTER TABLE qr_zones ADD COLUMN `latitude` DECIMAL(10,7) NULL");
    $pdo->exec("UPDATE qr_zones SET latitude = lat WHERE latitude IS NULL");
    $changes[] = "Added column: latitude (copied from lat)";
}

// 3. Add `longitude` (copy from `lng`) if missing
if (!col_exists($pdo, 'qr_zones', 'longitude')) {
    $pdo->exec("ALTER TABLE qr_zones ADD COLUMN `longitude` DECIMAL(10,7) NULL");
    $pdo->exec("UPDATE qr_zones SET longitude = lng WHERE longitude IS NULL");
    $changes[] = "Added column: longitude (copied from lng)";
}

// 4. Add `radius_metres` (copy from `radius_m`) if missing
if (!col_exists($pdo, 'qr_zones', 'radius_metres')) {
    $pdo->exec("ALTER TABLE qr_zones ADD COLUMN `radius_metres` SMALLINT NOT NULL DEFAULT 200");
    $pdo->exec("UPDATE qr_zones SET radius_metres = radius_m WHERE 1");
    $changes[] = "Added column: radius_metres (copied from radius_m)";
}

// 5. Add `token` (copy from `current_token`) if missing
if (!col_exists($pdo, 'qr_zones', 'token')) {
    $pdo->exec("ALTER TABLE qr_zones ADD COLUMN `token` VARCHAR(100) NULL");
    $pdo->exec("UPDATE qr_zones SET token = current_token WHERE token IS NULL");
    $changes[] = "Added column: token (copied from current_token)";
}

// 6. Add `created_by` if missing
if (!col_exists($pdo, 'qr_zones', 'created_by')) {
    $pdo->exec("ALTER TABLE qr_zones ADD COLUMN `created_by` INT UNSIGNED NULL");
    $changes[] = "Added column: created_by";
}

// 7. Add `scan_count` if missing
if (!col_exists($pdo, 'qr_zones', 'scan_count')) {
    $pdo->exec("ALTER TABLE qr_zones ADD COLUMN `scan_count` INT UNSIGNED NOT NULL DEFAULT 0");
    $changes[] = "Added column: scan_count";
}

// ── attendance table ──

// 8. Add `method` if missing
if (!col_exists($pdo, 'attendance', 'method')) {
    $pdo->exec("ALTER TABLE attendance ADD COLUMN `method` VARCHAR(20) NULL DEFAULT 'manual'");
    $changes[] = "Added column: attendance.method";
}

// 9. Add `check_in_lat` if missing
if (!col_exists($pdo, 'attendance', 'check_in_lat')) {
    $pdo->exec("ALTER TABLE attendance ADD COLUMN `check_in_lat` DECIMAL(10,7) NULL");
    $changes[] = "Added column: attendance.check_in_lat";
}

// 10. Add `check_in_lng` if missing
if (!col_exists($pdo, 'attendance', 'check_in_lng')) {
    $pdo->exec("ALTER TABLE attendance ADD COLUMN `check_in_lng` DECIMAL(10,7) NULL");
    $changes[] = "Added column: attendance.check_in_lng";
}

// 11. Add `check_out_lat` if missing
if (!col_exists($pdo, 'attendance', 'check_out_lat')) {
    $pdo->exec("ALTER TABLE attendance ADD COLUMN `check_out_lat` DECIMAL(10,7) NULL");
    $changes[] = "Added column: attendance.check_out_lat";
}

// 12. Add `check_out_lng` if missing
if (!col_exists($pdo, 'attendance', 'check_out_lng')) {
    $pdo->exec("ALTER TABLE attendance ADD COLUMN `check_out_lng` DECIMAL(10,7) NULL");
    $changes[] = "Added column: attendance.check_out_lng";
}

echo "<pre>Migration complete.\n\n";
if ($changes) {
    echo implode("\n", $changes);
} else {
    echo "Nothing to do — all columns already exist.";
}
echo "\n\nDELETE this file after running.</pre>";
