<?php
/**
 * StaffSync — attendance.php
 * Actions: checkin | checkout | list | my_today | regularise | approve_regularisation
 *          override | summary | team_today
 */
require_once __DIR__ . '/config.php';

$action = $_GET['action'] ?? body()['action'] ?? '';

match($action) {
    'checkin'                => action_checkin(),
    'checkout'               => action_checkout(),
    'list'                   => action_list(),
    'my_list'                => action_my_list(),
    'my_today'               => action_my_today(),
    'regularise'             => action_regularise(),
    'approve_regularisation' => action_approve_regularisation(),
    'override'               => action_override(),
    'summary'                => action_summary(),
    'team_today'             => action_team_today(),
    default                  => json_error("Unknown action: $action"),
};

/* ─────────────────── CHECK-IN ─────────────────── */
function action_checkin(): never {
    require_method('POST');
    $u = auth_user();
    $b = body();

    $today  = date('Y-m-d');
    $userId = $u['user_id'];

    // Prevent duplicate check-in
    $dup = db()->prepare('SELECT id FROM attendance WHERE user_id = ? AND date = ? AND check_in IS NOT NULL LIMIT 1');
    $dup->execute([$userId, $today]);
    if ($dup->fetch()) json_error('Already checked in today', 409);

    // Get user shift
    $uRow = db()->prepare('SELECT shift_start, department FROM users WHERE id = ? LIMIT 1');
    $uRow->execute([$userId]);
    $usr = $uRow->fetch();

    $checkInTime = date('H:i:s');
    $shiftStart  = $usr['shift_start'] ?? '07:00:00';
    $lateAfter   = date('H:i:s', strtotime($shiftStart) + 15 * 60);  // 15 min grace
    $status      = $checkInTime > $lateAfter ? 'LATE' : 'PRESENT';

    // QR + geofence validation
    $qrToken = $b['qr_token'] ?? null;
    $lat     = f($b['lat'] ?? 0);
    $lng     = f($b['lng'] ?? 0);

    if ($qrToken) {
        $qrValid = validate_qr_token($qrToken);
        if (!$qrValid) json_error('QR token invalid or expired', 400);
    }

    $method = $b['method'] ?? 'manual';

    // Build INSERT dynamically — avoid crashing on missing optional columns
    $cols   = ['user_id','date','check_in','status','created_at'];
    $vals   = [$userId, $today, $checkInTime, $status, date('Y-m-d H:i:s')];
    $marks  = ['?','?','?','?','?'];

    foreach (['method' => $method, 'check_in_lat' => ($lat ?: null), 'check_in_lng' => ($lng ?: null)] as $col => $val) {
        $r = db()->query("SHOW COLUMNS FROM attendance LIKE '$col'");
        if ($r->fetch()) { $cols[] = $col; $vals[] = $val; $marks[] = '?'; }
    }

    $sql = 'INSERT INTO attendance (' . implode(',', $cols) . ') VALUES (' . implode(',', $marks) . ')';
    db()->prepare($sql)->execute($vals);
    $attId = (int) db()->lastInsertId();

    audit_log($userId, 'checkin', "Check-in $checkInTime — $status", 'checkin');
    json_ok(['attendance_id' => $attId, 'status' => $status, 'check_in' => $checkInTime, 'date' => $today]);
}

function validate_qr_token(string $token): bool {
    // Support both old column name (current_token) and new (token)
    $r   = db()->query("SHOW COLUMNS FROM qr_zones LIKE 'token'");
    $col = $r->fetch() ? 'token' : 'current_token';
    $stmt = db()->prepare(
        "SELECT id FROM qr_zones WHERE `$col` = ? AND token_expires_at > NOW() AND is_active = 1 LIMIT 1"
    );
    $stmt->execute([$token]);
    return (bool) $stmt->fetch();
}

/* ─────────────────── CHECK-OUT ─────────────────── */
function action_checkout(): never {
    require_method('POST');
    $u = auth_user();
    $b = body();

    $today  = date('Y-m-d');
    $userId = $u['user_id'];
    $lat    = f($b['lat'] ?? 0);
    $lng    = f($b['lng'] ?? 0);

    $stmt = db()->prepare(
        'SELECT id, check_in FROM attendance WHERE user_id = ? AND date = ? AND check_out IS NULL LIMIT 1'
    );
    $stmt->execute([$userId, $today]);
    $att = $stmt->fetch();
    if (!$att) json_error('No active check-in found for today', 404);

    $checkOutTime = date('H:i:s');
    $inTs    = strtotime($today . ' ' . $att['check_in']);
    $hours   = round((time() - $inTs) / 3600, 2);

    // Build UPDATE dynamically — avoid crashing on missing optional columns
    $sets   = ['check_out = ?', 'hours_worked = ?'];
    $params = [$checkOutTime, $hours];

    foreach (['check_out_lat' => ($lat ?: null), 'check_out_lng' => ($lng ?: null)] as $col => $val) {
        $r = db()->query("SHOW COLUMNS FROM attendance LIKE '$col'");
        if ($r->fetch()) { $sets[] = "$col = ?"; $params[] = $val; }
    }
    $params[] = $att['id'];

    db()->prepare('UPDATE attendance SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);

    audit_log($userId, 'checkout', "Check-out $checkOutTime — {$hours}h worked", 'checkin');
    json_ok(['check_out' => $checkOutTime, 'hours_worked' => $hours]);
}

/* ─────────────────── LIST (manager/HR/admin) ─────────────────── */
function action_list(): never {
    require_method('GET');
    $u = auth_user(['MANAGER','HR','IT_ADMIN']);

    $from   = $_GET['from']    ?? date('Y-m-01');
    $to     = $_GET['to']      ?? date('Y-m-d');
    $deptId = $_GET['dept']    ?? null;
    $uid    = i($_GET['user_id'] ?? 0);

    $sql    = 'SELECT a.*, u.full_name, u.employee_id, u.department
               FROM attendance a
               JOIN users u ON u.id = a.user_id
               WHERE a.date BETWEEN ? AND ?';
    $params = [$from, $to];

    if ($uid) { $sql .= ' AND a.user_id = ?'; $params[] = $uid; }
    if ($deptId) { $sql .= ' AND u.department = ?'; $params[] = $deptId; }
    $sql .= ' ORDER BY a.date DESC, u.full_name LIMIT 500';

    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    json_ok($stmt->fetchAll());
}

/* ─────────────────── MY TODAY ─────────────────── */
function action_my_today(): never {
    require_method('GET');
    $u = auth_user();

    $stmt = db()->prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ? LIMIT 1');
    $stmt->execute([$u['user_id'], date('Y-m-d')]);
    json_ok($stmt->fetch() ?: null);
}

/* ─────────────────── MY LIST (any employee — own records only) ─── */
function action_my_list(): never {
    require_method('GET');
    $u    = auth_user();
    $from = $_GET['from'] ?? date('Y-m-01');
    $to   = $_GET['to']   ?? date('Y-m-d');

    $stmt = db()->prepare(
        'SELECT * FROM attendance WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date DESC LIMIT 200'
    );
    $stmt->execute([$u['user_id'], $from, $to]);
    json_ok($stmt->fetchAll());
}

/* ─────────────────── REGULARISATION REQUEST ─────────────────── */
function action_regularise(): never {
    require_method('POST');
    $u = auth_user();
    $b = body();

    $date   = $b['date'] ?? date('Y-m-d');
    $reason = trim($b['reason'] ?? '');
    if (!$reason) json_error('Reason required');

    $stmt = db()->prepare(
        'INSERT INTO regularisation_requests (user_id, date, reason, status, created_at) VALUES (?, ?, ?, "pending", NOW())'
    );
    $stmt->execute([$u['user_id'], $date, $reason]);
    $reqId = db()->lastInsertId();

    audit_log($u['user_id'], 'regularise', "Regularisation request for $date", 'attendance');
    json_ok(['request_id' => $reqId], 201);
}

/* ─────────────────── APPROVE REGULARISATION ─────────────────── */
function action_approve_regularisation(): never {
    require_method('POST');
    $u  = auth_user(['MANAGER','HR']);
    $b  = body();
    $id = i($b['request_id'] ?? 0);
    $ac = $b['action'] ?? 'approve';

    $stmt = db()->prepare('SELECT * FROM regularisation_requests WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $req = $stmt->fetch();
    if (!$req) json_error('Request not found', 404);

    $newStatus = $ac === 'approve' ? 'approved' : 'rejected';
    db()->prepare('UPDATE regularisation_requests SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?')
        ->execute([$newStatus, $u['user_id'], $id]);

    if ($newStatus === 'approved') {
        // Update or insert attendance record
        $correctedIn = $b['corrected_check_in'] ?? null;
        $check = db()->prepare('SELECT id FROM attendance WHERE user_id = ? AND date = ?');
        $check->execute([$req['user_id'], $req['date']]);
        if ($check->fetch()) {
            db()->prepare('UPDATE attendance SET status = "PRESENT", manual_override = 1, override_by = ? WHERE user_id = ? AND date = ?')
                ->execute([$u['user_id'], $req['user_id'], $req['date']]);
        } else {
            db()->prepare(
                'INSERT INTO attendance (user_id, date, check_in, status, method, created_at) VALUES (?, ?, ?, "PRESENT", "regularisation", NOW())'
            )->execute([$req['user_id'], $req['date'], $correctedIn ?? '09:00:00']);
        }
    }

    audit_log($u['user_id'], 'regularise', "Regularisation $id $newStatus", 'attendance');
    json_ok("Request $newStatus");
}

/* ─────────────────── MANUAL OVERRIDE ─────────────────── */
function action_override(): never {
    require_method('POST');
    $u  = auth_user(['MANAGER','HR']);
    $b  = body();
    $uid    = i($b['user_id'] ?? 0);
    $date   = $b['date'] ?? '';
    $status = strtoupper($b['status'] ?? 'PRESENT');
    $reason = trim($b['reason'] ?? '');

    if (!$uid || !$date || !$reason) json_error('user_id, date, reason required');

    $valid = ['PRESENT','LATE','ABSENT','ON_LEAVE','HALF_DAY','WORK_FROM_HOME','HOLIDAY'];
    if (!in_array($status, $valid)) json_error('Invalid status');

    $check = db()->prepare('SELECT id FROM attendance WHERE user_id = ? AND date = ?');
    $check->execute([$uid, $date]);
    if ($check->fetch()) {
        db()->prepare('UPDATE attendance SET status = ?, manual_override = 1, override_by = ?, override_reason = ? WHERE user_id = ? AND date = ?')
            ->execute([$status, $u['user_id'], $reason, $uid, $date]);
    } else {
        db()->prepare('INSERT INTO attendance (user_id, date, status, method, manual_override, override_by, override_reason, created_at) VALUES (?, ?, ?, "manual", 1, ?, ?, NOW())')
            ->execute([$uid, $date, $status, $u['user_id'], $reason]);
    }

    audit_log($u['user_id'], 'override', "Attendance override: user $uid on $date → $status", 'attendance');
    json_ok('Override applied');
}

/* ─────────────────── SUMMARY (my monthly) ─────────────────── */
function action_summary(): never {
    require_method('GET');
    $u    = auth_user();
    $year = i($_GET['year']  ?? date('Y'));
    $mon  = i($_GET['month'] ?? date('n'));

    $from = sprintf('%04d-%02d-01', $year, $mon);
    $to   = date('Y-m-t', strtotime($from));

    $stmt = db()->prepare(
        'SELECT status, COUNT(*) as cnt FROM attendance WHERE user_id = ? AND date BETWEEN ? AND ? GROUP BY status'
    );
    $stmt->execute([$u['user_id'], $from, $to]);
    $rows = $stmt->fetchAll();

    $summary = [];
    foreach ($rows as $r) $summary[$r['status']] = (int)$r['cnt'];
    json_ok($summary);
}

/* ─────────────────── TEAM TODAY (manager) ─────────────────── */
function action_team_today(): never {
    require_method('GET');
    $u = auth_user(['MANAGER','HR','IT_ADMIN']);

    $today = date('Y-m-d');
    $stmt  = db()->prepare(
        'SELECT u.id, u.full_name, u.employee_id, u.department,
                a.status, a.check_in, a.check_out, a.hours_worked
         FROM users u
         LEFT JOIN attendance a ON a.user_id = u.id AND a.date = ?
         WHERE u.is_active = 1
         ORDER BY u.full_name'
    );
    $stmt->execute([$today]);
    json_ok($stmt->fetchAll());
}
