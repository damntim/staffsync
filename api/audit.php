<?php
/**
 * StaffSync — audit.php
 * Actions: list | stats | export
 */
require_once __DIR__ . '/config.php';

$action = $_GET['action'] ?? '';

match($action) {
    'list'   => action_list(),
    'stats'  => action_stats(),
    'export' => action_export(),
    default  => json_error("Unknown action: $action"),
};

/* ─────────────────── LIST ─────────────────── */
function action_list(): never {
    require_method('GET');
    auth_user(['HR','IT_ADMIN']);

    $type    = $_GET['type']    ?? null;
    $status  = $_GET['status']  ?? null;
    $uid     = i($_GET['user_id'] ?? 0);
    $from    = $_GET['from']    ?? date('Y-m-d');
    $to      = $_GET['to']      ?? date('Y-m-d');
    $limit   = min(i($_GET['limit'] ?? 100), 500);
    $search  = $_GET['search']  ?? null;

    $sql    = 'SELECT al.*, u.full_name, u.employee_id
               FROM audit_log al
               LEFT JOIN users u ON u.id = al.user_id
               WHERE DATE(al.created_at) BETWEEN ? AND ?';
    $params = [$from, $to];

    if ($type)   { $sql .= ' AND al.action_type = ?'; $params[] = $type; }
    if ($status) { $sql .= ' AND al.status = ?';      $params[] = $status; }
    if ($uid)    { $sql .= ' AND al.user_id = ?';     $params[] = $uid; }
    if ($search) {
        $sql .= ' AND (al.action LIKE ? OR al.detail LIKE ?)';
        $params[] = "%$search%";
        $params[] = "%$search%";
    }

    $sql .= ' ORDER BY al.created_at DESC LIMIT ' . $limit;

    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    json_ok($stmt->fetchAll());
}

/* ─────────────────── STATS ─────────────────── */
function action_stats(): never {
    require_method('GET');
    auth_user(['HR','IT_ADMIN']);

    $today = date('Y-m-d');

    $total = db()->query("SELECT COUNT(*) FROM audit_log WHERE DATE(created_at) = '$today'")->fetchColumn();
    $warn  = db()->query("SELECT COUNT(*) FROM audit_log WHERE DATE(created_at) = '$today' AND status = 'warn'")->fetchColumn();
    $error = db()->query("SELECT COUNT(*) FROM audit_log WHERE DATE(created_at) = '$today' AND status = 'error'")->fetchColumn();

    $byType = db()->query(
        "SELECT action_type, COUNT(*) as cnt FROM audit_log WHERE DATE(created_at) = '$today' GROUP BY action_type"
    )->fetchAll();

    json_ok(['total' => $total, 'warnings' => $warn, 'errors' => $error, 'by_type' => $byType]);
}

/* ─────────────────── EXPORT ─────────────────── */
function action_export(): never {
    require_method('GET');
    auth_user(['HR','IT_ADMIN']);

    $from = $_GET['from'] ?? date('Y-m-01');
    $to   = $_GET['to']   ?? date('Y-m-d');

    header('Content-Type: text/csv; charset=UTF-8');
    header("Content-Disposition: attachment; filename=\"audit_log_{$from}_{$to}.csv\"");
    header_remove('Content-Type');
    header('Content-Type: text/csv; charset=UTF-8');

    $out = fopen('php://output', 'w');
    fputcsv($out, ['Timestamp','Actor','Employee ID','Type','Action','Detail','IP','Status']);

    $stmt = db()->prepare(
        'SELECT al.created_at, u.full_name, u.employee_id, al.action_type, al.action, al.detail, al.ip_address, al.status
         FROM audit_log al
         LEFT JOIN users u ON u.id = al.user_id
         WHERE DATE(al.created_at) BETWEEN ? AND ?
         ORDER BY al.created_at DESC LIMIT 5000'
    );
    $stmt->execute([$from, $to]);
    foreach ($stmt->fetchAll() as $r) fputcsv($out, $r);

    fclose($out);
    exit;
}
