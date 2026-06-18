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
    'context' => action_context(),
    default   => json_error("Unknown action: $action"),
};

/* ─────────────────── APPLY ─────────────────── */
function action_apply(): never {
    // Supports both JSON body and multipart/form-data (for file uploads)
    require_method('POST');
    $u = auth_user();

    // $_POST is populated for multipart; body() for JSON
    $b = !empty($_POST) ? $_POST : body();

    $typeName  = trim($b['type'] ?? '');
    $startDate = $b['start_date'] ?? '';
    $endDate   = $b['end_date']   ?? '';
    $reason    = trim($b['reason'] ?? '');

    if (!$typeName)  json_error('Leave type required');
    if (!$startDate || !$endDate) json_error('Start and end dates required');
    if (strtotime($startDate) > strtotime($endDate)) json_error('End date must be after start date');
    if (!$reason) json_error('Reason required');

    // Validate type exists in DB
    $tStmt = db()->prepare('SELECT name, requires_document FROM leave_types WHERE name = ? AND is_active = 1 LIMIT 1');
    $tStmt->execute([$typeName]);
    $leaveType = $tStmt->fetch();
    if (!$leaveType) json_error('Invalid leave type');

    $type = $leaveType['name'];

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

    audit_log($u['user_id'], 'leave_apply', "$type leave $startDate to $endDate ($days days)", 'leave');
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

function get_balance(int $userId, string $type): ?float {
    $stmt = db()->prepare('SELECT remaining FROM leave_balances WHERE user_id = ? AND leave_type = ? LIMIT 1');
    $stmt->execute([$userId, $type]);
    $row = $stmt->fetch();
    return $row ? (float)$row['remaining'] : null;
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

/* ─────────────────── APPROVE (two-stage: Manager + HR) ───────────────────
 * Both a MANAGER and an HR must approve (in any order). The request only
 * becomes fully "approved" once BOTH stages are approved. Either rejecting
 * marks the whole request "rejected".
 */
function action_approve(): never {
    require_method('POST');
    $u  = auth_user(['MANAGER','HR']);
    $b  = body();
    $id = i($b['leave_id'] ?? 0);
    if (!$id) json_error('leave_id required');

    $stmt = db()->prepare('SELECT * FROM leave_requests WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $req = $stmt->fetch();
    if (!$req) json_error('Leave request not found', 404);
    if (in_array($req['status'], ['rejected','cancelled'], true)) {
        json_error('This request is already ' . $req['status'], 409);
    }

    $isHR   = $u['role'] === 'HR' || $u['role'] === 'IT_ADMIN';
    $stage  = $isHR ? 'hr' : 'manager';
    $note   = trim((string)($b['comment'] ?? $b['note'] ?? '')) ?: null;

    // Already actioned this stage?
    if (($req["{$stage}_status"] ?? 'pending') === 'approved') {
        json_error('You have already approved this request', 409);
    }

    // HR-stage policy guard: don't let it exceed the allowed balance
    if ($isHR) {
        $bal = get_balance((int)$req['user_id'], $req['type']);
        if ($bal !== null && $bal < (float)$req['days']) {
            json_error("Exceeds allowed balance — available {$bal}d, requested {$req['days']}d. Cannot approve.", 422);
        }
    }

    db()->prepare(
        "UPDATE leave_requests
         SET {$stage}_status = 'approved', {$stage}_id = ?, {$stage}_note = ?, {$stage}_acted_at = NOW()
         WHERE id = ?"
    )->execute([$u['user_id'], $note, $id]);

    audit_log($u['user_id'], 'leave_approve', "Leave $id — {$stage} approved", 'leave');

    // Re-read to see if BOTH stages are now approved
    $stmt->execute([$id]);
    $req = $stmt->fetch();

    if ($req['manager_status'] === 'approved' && $req['hr_status'] === 'approved') {
        finalize_leave_approved($req, (int)$u['user_id']);
        json_ok(['stage' => $stage, 'finalised' => true, 'message' => 'Leave fully approved']);
    }

    $waiting = $stage === 'manager' ? 'HR' : 'manager';
    json_ok(['stage' => $stage, 'finalised' => false, 'message' => "Approved — awaiting $waiting sign-off"]);
}

/* Apply the side-effects once a leave is fully approved by both stages. */
function finalize_leave_approved(array $req, int $actorId): void {
    db()->prepare("UPDATE leave_requests SET status = 'approved', approver_id = ?, approved_at = NOW() WHERE id = ?")
        ->execute([$actorId, $req['id']]);

    // Deduct balance
    db()->prepare('UPDATE leave_balances SET used = used + ? WHERE user_id = ? AND leave_type = ?')
        ->execute([$req['days'], $req['user_id'], $req['type']]);

    // Auto-set attendance records to ON_LEAVE for the date range (skip weekends)
    $cur = strtotime($req['start_date']);
    $end = strtotime($req['end_date']);
    while ($cur <= $end) {
        if ((int) date('N', $cur) < 6) {
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
    audit_log($actorId, 'leave_finalise', "Leave {$req['id']} fully approved ({$req['days']} days)", 'leave');
}

/* ─────────────────── REJECT (either stage rejects the whole request) ─────────────────── */
function action_reject(): never {
    require_method('POST');
    $u  = auth_user(['MANAGER','HR']);
    $b  = body();
    $id = i($b['leave_id'] ?? 0);
    if (!$id) json_error('leave_id required');

    $stmt = db()->prepare('SELECT * FROM leave_requests WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $req = $stmt->fetch();
    if (!$req) json_error('Leave request not found', 404);
    if (in_array($req['status'], ['rejected','cancelled','approved'], true)) {
        json_error('This request is already ' . $req['status'], 409);
    }

    $isHR  = $u['role'] === 'HR' || $u['role'] === 'IT_ADMIN';
    $stage = $isHR ? 'hr' : 'manager';
    $note  = trim((string)($b['comment'] ?? $b['note'] ?? '')) ?: null;

    db()->prepare(
        "UPDATE leave_requests
         SET {$stage}_status = 'rejected', {$stage}_id = ?, {$stage}_note = ?, {$stage}_acted_at = NOW(),
             status = 'rejected', rejection_reason = ?
         WHERE id = ?"
    )->execute([$u['user_id'], $note, $note, $id]);

    audit_log($u['user_id'], 'leave_reject', "Leave $id rejected at {$stage} stage", 'leave');
    json_ok(['stage' => $stage, 'message' => 'Leave rejected']);
}

/* ─────────────────── APPROVER CONTEXT ───────────────────
 * Role-specific decision context for a single leave request.
 * Manager → tasks in range + team coverage. HR → balance/policy check.
 */
function action_context(): never {
    require_method('GET');
    $u  = auth_user(['MANAGER','HR','IT_ADMIN']);
    $id = i($_GET['leave_id'] ?? 0);
    if (!$id) json_error('leave_id required');

    $stmt = db()->prepare(
        'SELECT lr.*, u.full_name, u.department, u.employee_id
         FROM leave_requests lr JOIN users u ON u.id = lr.user_id WHERE lr.id = ? LIMIT 1'
    );
    $stmt->execute([$id]);
    $req = $stmt->fetch();
    if (!$req) json_error('Leave request not found', 404);

    $out = [
        'leave'          => $req,
        'manager_status' => $req['manager_status'] ?? 'pending',
        'hr_status'      => $req['hr_status'] ?? 'pending',
        'manager_note'   => $req['manager_note'] ?? null,
        'hr_note'        => $req['hr_note'] ?? null,
    ];

    /* ── Manager context: job & task impact + team coverage ── */
    $tasks = [];
    try {
        $tq = db()->prepare(
            "SELECT id, title, status, priority, due_date
             FROM tasks
             WHERE assignee_id = ?
               AND status <> 'DONE'
               AND (due_date IS NULL OR due_date BETWEEN ? AND ?
                    OR due_date < ?)            -- overdue tasks still matter
             ORDER BY (due_date IS NULL), due_date
             LIMIT 50"
        );
        $tq->execute([$req['user_id'], $req['start_date'], $req['end_date'], date('Y-m-d')]);
        $tasks = $tq->fetchAll();
    } catch (\PDOException) { $tasks = []; }

    $today = date('Y-m-d');
    foreach ($tasks as &$t) {
        $t['overdue'] = $t['due_date'] && $t['due_date'] < $today;
    }
    unset($t);

    // Teammates (same department) also off during the requested range
    $coverage = [];
    try {
        $cq = db()->prepare(
            "SELECT lr.id, lr.start_date, lr.end_date, lr.type, u.full_name
             FROM leave_requests lr JOIN users u ON u.id = lr.user_id
             WHERE u.department = ? AND lr.user_id <> ?
               AND lr.status = 'approved'
               AND NOT (lr.end_date < ? OR lr.start_date > ?)
             ORDER BY lr.start_date LIMIT 20"
        );
        $cq->execute([$req['department'], $req['user_id'], $req['start_date'], $req['end_date']]);
        $coverage = $cq->fetchAll();
    } catch (\PDOException) { $coverage = []; }

    $out['manager_context'] = [
        'tasks'         => $tasks,
        'tasks_total'   => count($tasks),
        'tasks_overdue' => count(array_filter($tasks, fn($t) => !empty($t['overdue']))),
        'team_off'      => $coverage,
        'team_off_count'=> count($coverage),
    ];

    /* ── HR context: balance / policy check ── */
    $remaining  = get_balance((int)$req['user_id'], $req['type']);
    $reqDays    = (float)$req['days'];
    $withinBal  = $remaining === null ? null : ($remaining >= $reqDays);

    // requires_document policy
    $needsDoc = false;
    try {
        $tt = db()->prepare('SELECT requires_document FROM leave_types WHERE name = ? LIMIT 1');
        $tt->execute([$req['type']]);
        $needsDoc = (bool) ($tt->fetchColumn() ?: false);
    } catch (\PDOException) {}

    $out['hr_context'] = [
        'requested_days' => $reqDays,
        'remaining'      => $remaining,
        'within_balance' => $withinBal,
        'requires_document' => $needsDoc,
        'document_attached' => !empty($req['document_path']),
        'document_ok'    => !$needsDoc || !empty($req['document_path']),
    ];

    json_ok($out);
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
        db()->prepare('UPDATE leave_balances SET used = GREATEST(0, used - ?) WHERE user_id = ? AND leave_type = ?')
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
        'SELECT leave_type, entitlement, used, pending, remaining FROM leave_balances WHERE user_id = ? ORDER BY leave_type'
    );
    $stmt->execute([$uid]);
    json_ok($stmt->fetchAll());
}

/* ─────────────────── TYPES ─────────────────── */
function action_types(): never {
    require_method('GET');
    auth_user();
    $stmt = db()->query('SELECT id, name, days_per_year, requires_document, carry_forward FROM leave_types WHERE is_active = 1 ORDER BY name');
    json_ok($stmt->fetchAll());
}
