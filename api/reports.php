<?php
/**
 * StaffSync — reports.php
 * Actions: attendance_summary | leave_summary | punctuality | face_status
 *          task_completion | geofence_breaches | export_csv
 */
require_once __DIR__ . '/config.php';

$action = $_GET['action'] ?? '';

match($action) {
    'attendance_summary' => action_attendance_summary(),
    'leave_summary'      => action_leave_summary(),
    'punctuality'        => action_punctuality(),
    'face_status'        => action_face_status(),
    'task_completion'    => action_task_completion(),
    'geofence_breaches'  => action_geofence_breaches(),
    'export_csv'         => action_export_csv(),
    default              => json_error("Unknown action: $action"),
};

function date_range(): array {
    $from = $_GET['from'] ?? date('Y-01-01');
    $to   = $_GET['to']   ?? date('Y-m-d');
    return [$from, $to];
}

/* ─────────────────── ATTENDANCE SUMMARY ─────────────────── */
function action_attendance_summary(): never {
    require_method('GET');
    auth_user(['MANAGER','HR','IT_ADMIN']);
    [$from, $to] = date_range();

    $stmt = db()->prepare(
        'SELECT u.full_name, u.employee_id, u.department,
                COUNT(a.id) as total_days,
                SUM(a.status = "PRESENT") as present,
                SUM(a.status = "LATE")    as late,
                SUM(a.status = "ABSENT")  as absent,
                SUM(a.status = "ON_LEAVE") as on_leave,
                ROUND(SUM(COALESCE(a.hours_worked, 0)), 1) as total_hours
         FROM users u
         LEFT JOIN attendance a ON a.user_id = u.id AND a.date BETWEEN ? AND ?
         WHERE u.is_active = 1
         GROUP BY u.id
         ORDER BY u.full_name'
    );
    $stmt->execute([$from, $to]);
    json_ok($stmt->fetchAll());
}

/* ─────────────────── LEAVE SUMMARY ─────────────────── */
function action_leave_summary(): never {
    require_method('GET');
    auth_user(['MANAGER','HR','IT_ADMIN']);
    [$from, $to] = date_range();

    $stmt = db()->prepare(
        'SELECT u.full_name, u.employee_id, u.department, lr.type,
                COUNT(lr.id) as requests,
                SUM(lr.days) as days_taken
         FROM users u
         LEFT JOIN leave_requests lr ON lr.user_id = u.id AND lr.status = "approved"
                   AND lr.start_date BETWEEN ? AND ?
         WHERE u.is_active = 1
         GROUP BY u.id, lr.type
         ORDER BY u.full_name, lr.type'
    );
    $stmt->execute([$from, $to]);
    json_ok($stmt->fetchAll());
}

/* ─────────────────── PUNCTUALITY ─────────────────── */
function action_punctuality(): never {
    require_method('GET');
    auth_user(['MANAGER','HR','IT_ADMIN']);
    [$from, $to] = date_range();

    $stmt = db()->prepare(
        'SELECT u.full_name, u.employee_id, u.department,
                SUM(a.status IN ("PRESENT","LATE")) as working_days,
                SUM(a.status = "LATE") as late_days,
                ROUND(
                  (SUM(a.status = "PRESENT") / NULLIF(SUM(a.status IN ("PRESENT","LATE")), 0)) * 100, 1
                ) as punctuality_pct
         FROM users u
         LEFT JOIN attendance a ON a.user_id = u.id AND a.date BETWEEN ? AND ?
         WHERE u.is_active = 1
         GROUP BY u.id
         ORDER BY punctuality_pct DESC'
    );
    $stmt->execute([$from, $to]);
    json_ok($stmt->fetchAll());
}

/* ─────────────────── FACE STATUS ─────────────────── */
function action_face_status(): never {
    require_method('GET');
    auth_user(['HR','IT_ADMIN']);

    $stmt = db()->query(
        'SELECT u.full_name, u.employee_id, u.department, u.face_enrolled,
                fd.last_verified, fd.fail_count
         FROM users u
         LEFT JOIN face_descriptors fd ON fd.user_id = u.id
         WHERE u.is_active = 1
         ORDER BY u.department, u.full_name'
    );
    json_ok($stmt->fetchAll());
}

/* ─────────────────── TASK COMPLETION ─────────────────── */
function action_task_completion(): never {
    require_method('GET');
    auth_user(['MANAGER','HR','IT_ADMIN']);
    [$from, $to] = date_range();

    $stmt = db()->prepare(
        'SELECT u.full_name, u.employee_id, u.department,
                COUNT(t.id) as total_tasks,
                SUM(t.status = "DONE") as done,
                SUM(t.status = "IN_PROGRESS") as in_progress,
                SUM(t.status = "TODO") as todo,
                SUM(t.status = "REVIEW") as in_review
         FROM users u
         LEFT JOIN tasks t ON t.assignee_id = u.id AND t.created_at BETWEEN ? AND ?
         WHERE u.is_active = 1
         GROUP BY u.id
         ORDER BY done DESC'
    );
    $stmt->execute([$from, $to]);
    json_ok($stmt->fetchAll());
}

/* ─────────────────── GEOFENCE BREACHES ─────────────────── */
function action_geofence_breaches(): never {
    require_method('GET');
    auth_user(['MANAGER','HR','IT_ADMIN']);
    [$from, $to] = date_range();

    $stmt = db()->prepare(
        'SELECT sl.scanned_at, u.full_name, u.employee_id, z.name as zone_name,
                sl.lat, sl.lng, sl.geofence_pass
         FROM qr_scan_log sl
         JOIN users u ON u.id = sl.user_id
         JOIN qr_zones z ON z.id = sl.zone_id
         WHERE sl.geofence_pass = 0 AND DATE(sl.scanned_at) BETWEEN ? AND ?
         ORDER BY sl.scanned_at DESC LIMIT 200'
    );
    $stmt->execute([$from, $to]);
    json_ok($stmt->fetchAll());
}

/* ─────────────────── EXPORT CSV ─────────────────── */
function action_export_csv(): never {
    require_method('GET');
    auth_user(['HR','IT_ADMIN']);

    $type = $_GET['type'] ?? 'attendance';
    [$from, $to] = date_range();

    header('Content-Type: text/csv; charset=UTF-8');
    header("Content-Disposition: attachment; filename=\"staffsync_{$type}_{$from}_{$to}.csv\"");
    // Remove JSON content type header set by config
    header_remove('Content-Type');
    header('Content-Type: text/csv; charset=UTF-8');

    $out = fopen('php://output', 'w');

    match($type) {
        'attendance' => export_attendance($out, $from, $to),
        'leave'      => export_leave($out, $from, $to),
        'punctuality'=> export_punctuality($out, $from, $to),
        default      => export_attendance($out, $from, $to),
    };

    fclose($out);
    exit;
}

function export_attendance($handle, string $from, string $to): void {
    fputcsv($handle, ['Employee','Employee ID','Department','Date','Status','Check In','Check Out','Hours']);
    $stmt = db()->prepare(
        'SELECT u.full_name, u.employee_id, u.department, a.date, a.status, a.check_in, a.check_out, a.hours_worked
         FROM attendance a JOIN users u ON u.id = a.user_id
         WHERE a.date BETWEEN ? AND ? ORDER BY a.date, u.full_name'
    );
    $stmt->execute([$from, $to]);
    foreach ($stmt->fetchAll() as $r) fputcsv($handle, $r);
}

function export_leave($handle, string $from, string $to): void {
    fputcsv($handle, ['Employee','Employee ID','Department','Type','Start','End','Days','Status','Submitted']);
    $stmt = db()->prepare(
        'SELECT u.full_name, u.employee_id, u.department, lr.type, lr.start_date, lr.end_date, lr.days, lr.status, lr.created_at
         FROM leave_requests lr JOIN users u ON u.id = lr.user_id
         WHERE lr.start_date BETWEEN ? AND ? ORDER BY lr.start_date, u.full_name'
    );
    $stmt->execute([$from, $to]);
    foreach ($stmt->fetchAll() as $r) fputcsv($handle, $r);
}

function export_punctuality($handle, string $from, string $to): void {
    fputcsv($handle, ['Employee','Employee ID','Department','Working Days','Late Days','Punctuality %']);
    $stmt = db()->prepare(
        'SELECT u.full_name, u.employee_id, u.department,
                SUM(a.status IN ("PRESENT","LATE")) as working_days,
                SUM(a.status = "LATE") as late_days,
                ROUND((SUM(a.status = "PRESENT") / NULLIF(SUM(a.status IN ("PRESENT","LATE")), 0)) * 100, 1) as pct
         FROM users u LEFT JOIN attendance a ON a.user_id = u.id AND a.date BETWEEN ? AND ?
         WHERE u.is_active = 1 GROUP BY u.id ORDER BY u.full_name'
    );
    $stmt->execute([$from, $to]);
    foreach ($stmt->fetchAll() as $r) fputcsv($handle, $r);
}
