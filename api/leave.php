<?php
/**
 * StaffSync — leave.php
 * Actions: apply | list | my_leaves | approve | reject | cancel | balance | types
 */
require_once __DIR__ . '/config.php';

$action = $_GET['action'] ?? body()['action'] ?? '';

match($action) {
    'apply'   => action_apply(),
    'list'    => action_list(),
    'my_leaves' => action_my_leaves(),
    'approve' => action_approve(),
    'reject'  => action_reject(),
    'cancel'  => action_cancel(),
    'balance' => action_balance(),
    'types'   => action_types(),
    default   => json_error("Unknown action: $action"),
};

/* ─────────────────── APPLY ─────────────────── */
function action_apply(): never {
    require_method('POST');
    $u = auth_user();
    $b = body();

    $type      = strtolower(trim($b['type'] ?? ''));
    $startDate = $b['start_date'] ?? '';
    $endDate   = $b['end_date']   ?? '';
    $reason    = trim($b['reason'] ?? '');

    $validTypes = ['annual','sick','casual','maternity','paternity','unpaid','other'];
    if (!in_array($type, $validTypes)) json_error('Invalid leave type');
    if (!$startDate || !$endDate) json_error('Start and end dates required');
    if (strtotime($startDate) > strtotime($endDate)) json_error('End date must be after start date');
    if (!$reason) json_error('Reason required');

    // Business days count (skip weekends)
    $days = business_days($startDate, $endDate);
    if ($days < 1) json_error('No working days in selected range');

    // Check balance
    $bal = get_balance($u['user_id'], $type);
    if ($bal !== null && $bal < $days) {
        json_error("Insufficient $type leave balance (available: {$bal} days, requested: {$days})");
    }

    // Overlap check — existing approved/pending
    $ov = db()->prepare(
        'SELECT id FROM leave_requests WHERE user_id = ? AND status IN ("approved","pending")
         AND NOT (end_date < ? OR start_date > ?)'
    );
    $ov->execute([$u['user_id'], $startDate, $endDate]);
    if ($ov->fetch()) json_error('Overlapping leave request already exists', 409);

    // Handle document upload
    $docPath = null;
    if (!empty($_FILES['document']['tmp_name'])) {
        $docPath = handle_upload($_FILES['document'], 'leaves');
    }

    $stmt = db()->prepare(
        'INSERT INTO leave_requests (user_id, type, start_date, end_date, days, reason, document_path, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, "pending", NOW())'
    );
    $stmt->execute([$u['user_id'], $type, $startDate, $endDate, $days, $reason, $docPath]);
    $leaveId = db()->lastInsertId();

    audit_log($u['user_id'], 'leave_apply', "$type leave $startDate–$endDate ($days days)", 'leave');
    json_ok(['leave_id' => $leaveId, 'days' => $days], 201);
}

function business_days(string $from, string $to): int {
    $count = 0;
    $cur   = strtotime($from);
    $end   = strtotime($to);
    while ($cur <= $end) {
        $dow = (int) date('N', $cur);
        if ($dow < 6) $count++;
        $cur = strtotime('+1 day', $cur);
    }
    return $count;
}

function get_balance(int $userId, string $type): ?int {
    $stmt = db()->prepare('SELECT balance FROM leave_balances WHERE user_id = ? AND type = ? LIMIT 1');
    $stmt->execute([$userId, $type]);
    $row = $stmt->fetch();
    return $row ? (int)$row['balance'] : null;
}

function handle_upload(array $file, string $subdir): string {
    $maxBytes = UPLOAD_MAX_MB * 1024 * 1024;
    if ($file['size'] > $maxBytes) json_error('File too large (max ' . UPLOAD_MAX_MB . 'MB)');

    $ext     = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    $allowed = ['pdf','jpg','jpeg','png'];
    if (!in_array($ext, $allowed)) json_error('Unsupported file type');

    $dir = UPLOAD_DIR . $subdir . '/';
    if (!is_dir($dir)) mkdir($dir, 0755, true);

    $filename = uniqid('', true) . '.' . $ext;
    if (!move_uploaded_file($file['tmp_name'], $dir . $filename)) json_error('Upload failed');

    return $subdir . '/' . $filename;
}

/* ─────────────────── LIST ─────────────────── */
function action_list(): never {
    require_method('GET');
    $u = auth_user(['MANAGER','HR','IT_ADMIN']);

    $status = $_GET['status'] ?? 'all';
    $uid    = i($_GET['user_id'] ?? 0);
    $from   = $_GET['from'] ?? date('Y-01-01');
    $to     = $_GET['to']   ?? date('Y-12-31');

    $sql    = 'SELECT lr.*, u.full_name, u.employee_id, u.department
               FROM leave_requests lr
               JOIN users u ON u.id = lr.user_id
               WHERE lr.start_date BETWEEN ? AND ?';
    $params = [$from, $to];

    if ($status !== 'all') { $sql .= ' AND lr.status = ?'; $params[] = $status; }
    if ($uid)              { $sql .= ' AND lr.user_id = ?'; $params[] = $uid; }
    $sql .= ' ORDER BY lr.created_at DESC LIMIT 200';

    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    json_ok($stmt->fetchAll());
}

/* ─────────────────── MY LEAVES ─────────────────── */
function action_my_leaves(): never {
    require_method('GET');
    $u = auth_user();

    $stmt = db()->prepare(
        'SELECT * FROM leave_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
    );
    $stmt->execute([$u['user_id']]);
    json_ok($stmt->fetchAll());
}

/* ─────────────────── APPROVE ─────────────────── */
function action_approve(): never {
    require_method('POST');
    $u  = auth_user(['MANAGER','HR']);
    $b  = body();
    $id = i($b['leave_id'] ?? 0);
    if (!$id) json_error('leave_id required');

    $stmt = db()->prepare('SELECT * FROM leave_requests WHERE id = ? AND status = "pending" LIMIT 1');
    $stmt->execute([$id]);
    $req = $stmt->fetch();
    if (!$req) json_error('Leave request not found or not pending', 404);

    db()->prepare(
        'UPDATE leave_requests SET status = "approved", reviewed_by = ?, reviewed_at = NOW(), comment = ? WHERE id = ?'
    )->execute([$u['user_id'], $b['comment'] ?? null, $id]);

    // Deduct balance
    db()->prepare(
        'UPDATE leave_balances SET balance = balance - ? WHERE user_id = ? AND type = ?'
    )->execute([$req['days'], $req['user_id'], $req['type']]);

    // Auto-set attendance records to ON_LEAVE for the date range
    $cur = strtotime($req['start_date']);
    $end = strtotime($req['end_date']);
    while ($cur <= $end) {
        $dow = (int) date('N', $cur);
        if ($dow < 6) {
            $d = date('Y-m-d', $cur);
            $chk = db()->prepare('SELECT id FROM attendance WHERE user_id = ? AND date = ?');
            $chk->execute([$req['user_id'], $d]);
            if (!$chk->fetch()) {
                db()->prepare('INSERT INTO attendance (user_id, date, status, method, created_at) VALUES (?, ?, "ON_LEAVE", "leave", NOW())')
                    ->execute([$req['user_id'], $d]);
            } else {
                db()->prepare('UPDATE attendance SET status = "ON_LEAVE" WHERE user_id = ? AND date = ?')
                    ->execute([$req['user_id'], $d]);
            }
        }
        $cur = strtotime('+1 day', $cur);
    }

    audit_log($u['user_id'], 'leave_approve', "Leave $id approved ({$req['days']} days)", 'leave');
    json_ok('Leave approved');
}

/* ─────────────────── REJECT ─────────────────── */
function action_reject(): never {
    require_method('POST');
    $u  = auth_user(['MANAGER','HR']);
    $b  = body();
    $id = i($b['leave_id'] ?? 0);

    db()->prepare('UPDATE leave_requests SET status = "rejected", reviewed_by = ?, reviewed_at = NOW(), comment = ? WHERE id = ? AND status = "pending"')
        ->execute([$u['user_id'], $b['comment'] ?? null, $id]);

    audit_log($u['user_id'], 'leave_reject', "Leave $id rejected", 'leave');
    json_ok('Leave rejected');
}

/* ─────────────────── CANCEL ─────────────────── */
function action_cancel(): never {
    require_method('POST');
    $u  = auth_user();
    $b  = body();
    $id = i($b['leave_id'] ?? 0);

    $stmt = db()->prepare('SELECT * FROM leave_requests WHERE id = ? AND user_id = ? LIMIT 1');
    $stmt->execute([$id, $u['user_id']]);
    $req = $stmt->fetch();
    if (!$req) json_error('Not found or not yours', 404);
    if (!in_array($req['status'], ['pending','approved'])) json_error('Cannot cancel this leave');

    db()->prepare('UPDATE leave_requests SET status = "cancelled" WHERE id = ?')->execute([$id]);

    // Restore balance if was approved
    if ($req['status'] === 'approved') {
        db()->prepare('UPDATE leave_balances SET balance = balance + ? WHERE user_id = ? AND type = ?')
            ->execute([$req['days'], $u['user_id'], $req['type']]);
    }

    audit_log($u['user_id'], 'leave_cancel', "Leave $id cancelled", 'leave');
    json_ok('Leave cancelled');
}

/* ─────────────────── BALANCE ─────────────────── */
function action_balance(): never {
    require_method('GET');
    $u   = auth_user();
    $uid = i($_GET['user_id'] ?? $u['user_id']);

    // Only allow non-self view for managers+
    if ($uid !== $u['user_id']) {
        auth_user(['MANAGER','HR']);
    }

    $stmt = db()->prepare(
        'SELECT type, balance, entitlement, used FROM leave_balances WHERE user_id = ? ORDER BY type'
    );
    $stmt->execute([$uid]);
    json_ok($stmt->fetchAll());
}

/* ─────────────────── TYPES ─────────────────── */
function action_types(): never {
    require_method('GET');
    auth_user();
    json_ok(['annual','sick','casual','maternity','paternity','unpaid','other']);
}
