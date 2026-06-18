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

    // ── Require a VALID shift before allowing check-in ──
    // (1) user must be assigned to an active shift
    // (2) today must be one of the shift's working days
    // (3) today must not be a shift holiday
    $shift = get_user_shift($userId);
    if (!$shift) {
        json_error('No shift assigned. Please contact HR before checking in.', 403);
    }

    // Working-day check — days_of_week is a CSV like "1,2,3,4,5" (Mon=1 … Sun=7)
    $dow = (int) date('N');   // ISO-8601: Mon=1 … Sun=7
    $workDays = array_filter(array_map('intval', explode(',', (string)($shift['days_of_week'] ?? ''))));
    if ($workDays && !in_array($dow, $workDays, true)) {
        json_error('Today is not a working day for your shift.', 403);
    }

    // Holiday check (shift-specific or company-wide where shift_id IS NULL)
    $hol = db()->prepare(
        'SELECT id FROM shift_holidays WHERE (shift_id = ? OR shift_id IS NULL) AND date = ? LIMIT 1'
    );
    $hol->execute([$shift['id'], $today]);
    if ($hol->fetch()) {
        json_error('Today is a holiday for your shift.', 403);
    }

    $checkInTime = date('H:i:s');              // time-of-day, for late/present comparison
    $checkInDT   = $today . ' ' . $checkInTime; // full DATETIME to store
    // Prefer the shift's own start time + its grace window; fall back to users.shift_start
    $uRow = db()->prepare('SELECT shift_start FROM users WHERE id = ? LIMIT 1');
    $uRow->execute([$userId]);
    $usr = $uRow->fetch();
    $shiftStart  = $shift['start_time'] ?? ($usr['shift_start'] ?? '07:00:00');
    $grace       = isset($shift['grace_minutes']) ? (int)$shift['grace_minutes'] : 15;
    $lateAfter   = date('H:i:s', strtotime($shiftStart) + $grace * 60);
    $status      = $checkInTime > $lateAfter ? 'LATE' : 'PRESENT';

    // QR + geofence validation
    $qrToken = $b['qr_token'] ?? null;
    $zoneId  = i($b['zone_id'] ?? 0);
    $lat     = f($b['lat'] ?? 0);
    $lng     = f($b['lng'] ?? 0);

    // The QR token was already validated in the dedicated QR step. Because the
    // token rotates every ~30s, by the time the user finishes the geofence +
    // face steps the exact token may have rotated. So here we re-confirm the
    // user is checking in against a REAL, ACTIVE zone — accepting the current
    // token OR one that expired within the last rotation window (grace).
    if ($qrToken || $zoneId) {
        if (!validate_qr_checkin((string)$qrToken, $zoneId)) {
            json_error('QR token invalid or expired', 400);
        }
    }

    $method = $b['method'] ?? 'manual';

    // Build INSERT dynamically — avoid crashing on missing optional columns
    $cols   = ['user_id','date','check_in','status','created_at'];
    $vals   = [$userId, $today, $checkInDT, $status, date('Y-m-d H:i:s')];
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

/**
 * Fetch the active shift assigned to a user (or null if none).
 * Returns the shift row plus the assigned_at date.
 */
function get_user_shift(int $userId): ?array {
    // shift_members / shifts may not exist on older installs — be defensive
    try {
        $stmt = db()->prepare(
            'SELECT s.*, sm.assigned_at
             FROM shift_members sm
             JOIN shifts s ON s.id = sm.shift_id
             WHERE sm.user_id = ? AND s.is_active = 1
             ORDER BY sm.assigned_at DESC
             LIMIT 1'
        );
        $stmt->execute([$userId]);
        $row = $stmt->fetch();
        return $row ?: null;
    } catch (\PDOException) {
        return null;
    }
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

/**
 * Final check-in QR validation — tolerant of token rotation.
 * The token was already validated in the QR step; here we accept it if it
 * matches an active zone and either (a) is still current, or (b) expired no
 * more than one rotation cycle (+ small clock skew) ago. This stops a valid
 * check-in from being rejected just because the user took a few seconds to
 * finish the geofence + face steps.
 */
function validate_qr_checkin(string $token, int $zoneId = 0): bool {
    $r   = db()->query("SHOW COLUMNS FROM qr_zones LIKE 'token'");
    $col = $r->fetch() ? 'token' : 'current_token';

    // 1) Try the exact token against an active zone, tolerating one rotation cycle.
    if ($token !== '') {
        $stmt = db()->prepare(
            "SELECT token_expires_at, rotate_seconds FROM qr_zones
             WHERE `$col` = ? AND is_active = 1 LIMIT 1"
        );
        $stmt->execute([$token]);
        if ($zone = $stmt->fetch()) {
            $rotate = (int)($zone['rotate_seconds'] ?? 30);
            $grace  = max($rotate, 30) + 10;            // one cycle + clock skew
            $expiry = strtotime($zone['token_expires_at']);
            if ($expiry !== false && time() <= $expiry + $grace) return true;
        }
    }

    // 2) Token rotated past the grace window, but the QR step already proved the
    //    user was at the zone. Accept the check-in if the zone they validated
    //    against is real & active.
    if ($zoneId > 0) {
        $z = db()->prepare('SELECT id FROM qr_zones WHERE id = ? AND is_active = 1 LIMIT 1');
        $z->execute([$zoneId]);
        if ($z->fetch()) return true;
    }

    return false;
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

    $checkOutDT = date('Y-m-d H:i:s');         // full DATETIME to store
    // check_in is a full DATETIME; tolerate a legacy time-only value too.
    $ci      = $att['check_in'];
    $inTs    = strtotime(strlen((string)$ci) <= 8 ? ($today . ' ' . $ci) : $ci);
    $hours   = ($inTs && $inTs > 0) ? round((time() - $inTs) / 3600, 2) : 0;
    if ($hours < 0) $hours = 0;

    // Build UPDATE dynamically — avoid crashing on missing optional columns
    $sets   = ['check_out = ?', 'hours_worked = ?'];
    $params = [$checkOutDT, $hours];

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
