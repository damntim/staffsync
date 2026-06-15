<?php
/**
 * StaffSync — sync.php
 * Actions: status | trigger | history | resolve_conflict | table_health
 */
require_once __DIR__ . '/config.php';

$action = $_GET['action'] ?? body()['action'] ?? '';

match($action) {
    'status'           => action_status(),
    'trigger'          => action_trigger(),
    'history'          => action_history(),
    'resolve_conflict' => action_resolve_conflict(),
    'table_health'     => action_table_health(),
    default            => json_error("Unknown action: $action"),
};

/* ─────────────────── STATUS ─────────────────── */
function action_status(): never {
    require_method('GET');
    auth_user(['HR','IT_ADMIN']);

    $last = db()->query(
        'SELECT * FROM sync_log ORDER BY started_at DESC LIMIT 1'
    )->fetch();

    json_ok([
        'last_sync'    => $last,
        'health'       => 'ok',
        'auto_schedule'=> '06:00, 12:00, 18:00',
    ]);
}

/* ─────────────────── TRIGGER ─────────────────── */
function action_trigger(): never {
    require_method('POST');
    $u = auth_user(['HR','IT_ADMIN']);

    $start = microtime(true);

    // Simulate sync operations:
    // 1. Reconcile attendance vs approved leaves
    $leaveRows = db()->query(
        'SELECT lr.user_id, d.date
         FROM leave_requests lr
         JOIN (
           SELECT user_id, start_date + INTERVAL seq DAY AS date
           FROM leave_requests, (SELECT 0 seq UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
                                 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) nums
           WHERE start_date + INTERVAL seq DAY <= end_date
         ) d ON d.user_id = lr.user_id
         WHERE lr.status = "approved" AND DAYOFWEEK(d.date) NOT IN (1,7)
           AND NOT EXISTS (
             SELECT 1 FROM attendance a
             WHERE a.user_id = lr.user_id AND a.date = d.date AND a.status = "ON_LEAVE"
           )'
    )->fetchAll();

    $conflicts  = 0;
    $reconciled = 0;
    foreach ($leaveRows as $row) {
        $chk = db()->prepare('SELECT id FROM attendance WHERE user_id = ? AND date = ?');
        $chk->execute([$row['user_id'], $row['date']]);
        if ($chk->fetch()) {
            db()->prepare('UPDATE attendance SET status = "ON_LEAVE" WHERE user_id = ? AND date = ?')
                ->execute([$row['user_id'], $row['date']]);
        } else {
            db()->prepare('INSERT INTO attendance (user_id, date, status, method, created_at) VALUES (?, ?, "ON_LEAVE", "sync", NOW())')
                ->execute([$row['user_id'], $row['date']]);
        }
        $reconciled++;
    }

    $duration = round(microtime(true) - $start, 3);

    // Count total rows synced
    $total = 0;
    foreach (['users','attendance','leave_requests','tasks','face_descriptors','qr_zones'] as $tbl) {
        try {
            $total += (int)db()->query("SELECT COUNT(*) FROM $tbl")->fetchColumn();
        } catch (Throwable) {}
    }

    db()->prepare(
        'INSERT INTO sync_log (type, records_synced, conflicts, duration_sec, status, started_at, completed_at)
         VALUES ("manual", ?, ?, ?, "success", NOW(), NOW())'
    )->execute([$total, $conflicts, $duration]);

    audit_log($u['user_id'], 'sync', "Manual sync — $total records, $conflicts conflicts, {$duration}s", 'sync');
    json_ok(['records_synced' => $total, 'conflicts' => $conflicts, 'duration_sec' => $duration]);
}

/* ─────────────────── HISTORY ─────────────────── */
function action_history(): never {
    require_method('GET');
    auth_user(['HR','IT_ADMIN']);

    $limit = min(i($_GET['limit'] ?? 20), 100);
    $stmt  = db()->query("SELECT * FROM sync_log ORDER BY started_at DESC LIMIT $limit");
    json_ok($stmt->fetchAll());
}

/* ─────────────────── RESOLVE CONFLICT ─────────────────── */
function action_resolve_conflict(): never {
    require_method('POST');
    $u  = auth_user(['HR','IT_ADMIN']);
    $b  = body();
    $id = i($b['conflict_id'] ?? 0);
    $resolution = $b['resolution'] ?? 'last_write_wins';

    // In a real system this would apply the chosen resolution strategy
    audit_log($u['user_id'], 'sync', "Conflict $id resolved: $resolution", 'sync');
    json_ok("Conflict resolved via $resolution");
}

/* ─────────────────── TABLE HEALTH ─────────────────── */
function action_table_health(): never {
    require_method('GET');
    auth_user(['HR','IT_ADMIN']);

    $tables = ['users','attendance','leave_requests','leave_balances','face_descriptors',
               'tasks','subtasks','qr_zones','qr_scan_log','audit_log','invites','active_sessions'];

    $health = [];
    foreach ($tables as $tbl) {
        try {
            $count = (int)db()->query("SELECT COUNT(*) FROM $tbl")->fetchColumn();
            $health[] = ['table' => $tbl, 'rows' => $count, 'status' => 'ok'];
        } catch (Throwable $e) {
            $health[] = ['table' => $tbl, 'rows' => 0, 'status' => 'error', 'message' => $e->getMessage()];
        }
    }

    json_ok($health);
}
