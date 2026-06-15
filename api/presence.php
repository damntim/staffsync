<?php
/**
 * StaffSync — presence.php
 * Module 13: Continuous GPS Presence Monitoring
 *
 * Actions:
 *   heartbeat  POST  Employee sends GPS ping
 *   live_list  GET   Manager/HR: live presence board
 *   exempt     POST  Mark employee EXEMPT (field visit etc.)
 *   flag       POST  Manually escalate to PRESENCE_DOUBT
 *   clear_flag POST  Clear a flag / reset to CHECKED_IN
 *   my_status  GET   Employee: their own current presence status
 *   history    GET   Heartbeat history for a user (admin)
 */
require_once __DIR__ . '/config.php';

$action = $_GET['action'] ?? body()['action'] ?? '';

match($action) {
    'heartbeat'  => action_heartbeat(),
    'live_list'  => action_live_list(),
    'exempt'     => action_exempt(),
    'flag'       => action_flag(),
    'clear_flag' => action_clear_flag(),
    'my_status'  => action_my_status(),
    'history'    => action_history(),
    default      => json_error("Unknown action: $action"),
};

/* ─────────────── helpers ─────────────── */

function haversine(float $lat1, float $lng1, float $lat2, float $lng2): float {
    $R = 6371000; // metres
    $phi1 = deg2rad($lat1); $phi2 = deg2rad($lat2);
    $dphi = deg2rad($lat2 - $lat1);
    $dlam = deg2rad($lng2 - $lng1);
    $a = sin($dphi/2)**2 + cos($phi1)*cos($phi2)*sin($dlam/2)**2;
    return 2 * $R * asin(sqrt($a));
}

function nearest_zone(float $lat, float $lng): array|null {
    $zones = db()->query("SELECT id, name, lat, lng, radius_m, grace_period_min FROM qr_zones WHERE is_active = 1")->fetchAll();
    $best = null;
    $bestDist = PHP_INT_MAX;
    foreach ($zones as $z) {
        $d = haversine($lat, $lng, (float)$z['lat'], (float)$z['lng']);
        if ($d < $bestDist) { $bestDist = $d; $best = $z; }
    }
    if ($best === null) return null;
    return array_merge($best, ['distance_m' => (int)round($bestDist)]);
}

function upsert_presence(int $uid, array $data): void {
    $fields = implode(', ', array_map(fn($k) => "$k = :$k", array_keys($data)));
    $placeholders = implode(', ', array_map(fn($k) => ":$k", array_keys($data)));
    $cols = 'user_id, ' . implode(', ', array_keys($data));
    $vals = ':user_id, ' . implode(', ', array_map(fn($k) => ":$k", array_keys($data)));

    $sql = "INSERT INTO presence_status (user_id, $cols) VALUES (:user_id, $vals)
            ON DUPLICATE KEY UPDATE $fields, updated_at = NOW()";

    // simpler: use REPLACE / INSERT … ON DUPLICATE
    $stmt = db()->prepare(
        "INSERT INTO presence_status (user_id, " . implode(', ', array_keys($data)) . ")
         VALUES (:user_id, " . implode(', ', array_map(fn($k) => ":$k", array_keys($data))) . ")
         ON DUPLICATE KEY UPDATE " . implode(', ', array_map(fn($k) => "$k = VALUES($k)", array_keys($data))) . ", updated_at = NOW()"
    );
    $stmt->execute(array_merge([':user_id' => $uid], array_combine(array_map(fn($k) => ":$k", array_keys($data)), array_values($data))));
}

/* ─────────────── HEARTBEAT ─────────────── */
function action_heartbeat(): never {
    require_method('POST');
    $u = auth_user(['EMPLOYEE','MANAGER','HR','IT_ADMIN']);
    $b = body();

    $lat = (float)($b['lat'] ?? 0);
    $lng = (float)($b['lng'] ?? 0);
    $acc = isset($b['accuracy']) ? (int)$b['accuracy'] : null;

    if (!$lat && !$lng) json_error('lat/lng required');

    /* Find today's open attendance record */
    $today = date('Y-m-d');
    $att = db()->prepare("SELECT id FROM attendance WHERE user_id = ? AND date = ? AND check_out IS NULL LIMIT 1");
    $att->execute([$u['user_id'], $today]);
    $attRow = $att->fetch();

    /* If not checked in, update presence_status to CHECKED_OUT and bail */
    if (!$attRow) {
        upsert_presence($u['user_id'], ['status' => 'CHECKED_OUT', 'last_heartbeat' => date('Y-m-d H:i:s')]);
        json_ok(['status' => 'CHECKED_OUT', 'message' => 'Not checked in']);
    }

    $attId = (int)$attRow['id'];

    /* Nearest zone */
    $zone = nearest_zone($lat, $lng);
    $zoneId    = $zone ? (int)$zone['id']   : null;
    $distM     = $zone ? $zone['distance_m'] : null;
    $radiusM   = $zone ? (int)$zone['radius_m'] : 0;
    $insideZone = $zone && $distM <= $radiusM ? 1 : 0;

    $hbStatus = match(true) {
        $zone === null => 'NO_ZONE',
        $insideZone    => 'OK',
        default        => 'OUT_OF_ZONE',
    };

    /* Log heartbeat */
    db()->prepare("INSERT INTO gps_heartbeats (user_id, attendance_id, lat, lng, accuracy_m, zone_id, distance_m, inside_zone, status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        ->execute([$u['user_id'], $attId, $lat, $lng, $acc, $zoneId, $distM, $insideZone, $hbStatus]);

    /* Determine presence_status — don't overwrite EXEMPT or PRESENCE_DOUBT unless inside zone */
    $current = db()->prepare("SELECT status, flagged_at FROM presence_status WHERE user_id = ? LIMIT 1");
    $current->execute([$u['user_id']]);
    $cur = $current->fetch();

    $newStatus = 'CHECKED_IN';
    if ($cur && $cur['status'] === 'EXEMPT') {
        $newStatus = 'EXEMPT';           // keep exempt
    } elseif ($hbStatus === 'OUT_OF_ZONE') {
        /* Escalate to PRESENCE_DOUBT if already flagged and still out */
        if ($cur && in_array($cur['status'], ['OUT_OF_ZONE','PRESENCE_DOUBT'], true)) {
            $sinceFlag = $cur['flagged_at'] ? (time() - strtotime($cur['flagged_at'])) : 0;
            $newStatus = ($sinceFlag > 600) ? 'PRESENCE_DOUBT' : 'OUT_OF_ZONE';
        } else {
            $newStatus = 'OUT_OF_ZONE';
        }
    } elseif ($hbStatus === 'NO_ZONE') {
        $newStatus = 'CHECKED_IN';  // no geofence configured — just mark active
    }

    $flaggedAt = ($newStatus === 'OUT_OF_ZONE' && (!$cur || !in_array($cur['status'], ['OUT_OF_ZONE','PRESENCE_DOUBT'], true)))
        ? date('Y-m-d H:i:s') : ($cur['flagged_at'] ?? null);

    if ($newStatus === 'CHECKED_IN') $flaggedAt = null;

    upsert_presence($u['user_id'], [
        'attendance_id'  => $attId,
        'zone_id'        => $zoneId,
        'last_heartbeat' => date('Y-m-d H:i:s'),
        'last_lat'       => $lat,
        'last_lng'       => $lng,
        'last_dist_m'    => $distM,
        'inside_zone'    => $insideZone,
        'status'         => $newStatus,
        'flagged_at'     => $flaggedAt,
    ]);

    /* Log geofence breach */
    if ($hbStatus === 'OUT_OF_ZONE' && $zoneId) {
        $last = db()->prepare("SELECT id FROM geofence_breaches WHERE user_id = ? AND zone_id = ? AND breach_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE) LIMIT 1");
        $last->execute([$u['user_id'], $zoneId]);
        if (!$last->fetch()) {
            db()->prepare("INSERT INTO geofence_breaches (user_id, zone_id, lat, lng, distance_m) VALUES (?,?,?,?,?)")
                ->execute([$u['user_id'], $zoneId, $lat, $lng, $distM]);
        }
    }

    json_ok([
        'status'      => $newStatus,
        'inside_zone' => (bool)$insideZone,
        'distance_m'  => $distM,
        'zone'        => $zone ? $zone['name'] : null,
    ]);
}

/* ─────────────── LIVE LIST ─────────────── */
function action_live_list(): never {
    $u = auth_user(['MANAGER','HR','IT_ADMIN']);

    /* Mark INACTIVE_SIGNAL for anyone checked in with no heartbeat for 30+ min */
    db()->exec("
        UPDATE presence_status ps
        JOIN attendance a ON a.id = ps.attendance_id
        SET ps.status = 'INACTIVE_SIGNAL', ps.flagged_at = COALESCE(ps.flagged_at, NOW())
        WHERE ps.status = 'CHECKED_IN'
          AND (ps.last_heartbeat IS NULL OR ps.last_heartbeat < DATE_SUB(NOW(), INTERVAL 30 MINUTE))
          AND a.check_out IS NULL
          AND a.date = CURDATE()
    ");

    $rows = db()->query("
        SELECT
            u.id          AS user_id,
            u.full_name,
            u.department,
            u.role,
            ps.status,
            ps.last_heartbeat,
            ps.last_dist_m,
            ps.inside_zone,
            ps.flagged_at,
            ps.exempt_reason,
            qz.name       AS zone_name,
            a.check_in    AS check_in_time
        FROM presence_status ps
        JOIN users u  ON u.id = ps.user_id
        LEFT JOIN qr_zones qz ON qz.id = ps.zone_id
        LEFT JOIN attendance a ON a.id = ps.attendance_id
        WHERE u.is_active = 1
        ORDER BY
            FIELD(ps.status,'PRESENCE_DOUBT','OUT_OF_ZONE','INACTIVE_SIGNAL','CHECKED_IN','EXEMPT','CHECKED_OUT'),
            ps.last_heartbeat DESC
    ")->fetchAll();

    /* Recent events from geofence_breaches + audit */
    $events = db()->query("
        SELECT
            'OUT_OF_ZONE' AS type,
            u.full_name   AS name,
            gb.distance_m,
            qz.name       AS zone_name,
            gb.breach_at  AS ts
        FROM geofence_breaches gb
        JOIN users u    ON u.id = gb.user_id
        LEFT JOIN qr_zones qz ON qz.id = gb.zone_id
        WHERE gb.breach_at > DATE_SUB(NOW(), INTERVAL 8 HOUR)
        ORDER BY gb.breach_at DESC
        LIMIT 20
    ")->fetchAll();

    json_ok(['team' => $rows, 'events' => $events]);
}

/* ─────────────── MY STATUS ─────────────── */
function action_my_status(): never {
    $u = auth_user();
    $row = db()->prepare("
        SELECT ps.*, qz.name AS zone_name
        FROM presence_status ps
        LEFT JOIN qr_zones qz ON qz.id = ps.zone_id
        WHERE ps.user_id = ?
    ");
    $row->execute([$u['user_id']]);
    $data = $row->fetch() ?: ['status' => 'CHECKED_OUT'];
    json_ok($data);
}

/* ─────────────── EXEMPT ─────────────── */
function action_exempt(): never {
    require_method('POST');
    $u = auth_user(['MANAGER','HR','IT_ADMIN']);
    $b = body();
    $uid    = i($b['user_id'] ?? 0);
    $reason = s($b['reason'] ?? 'Field visit');
    if (!$uid) json_error('user_id required');

    upsert_presence($uid, [
        'status'       => 'EXEMPT',
        'exempt_reason'=> $reason,
        'flagged_at'   => null,
    ]);
    audit_log($u['user_id'], 'presence_exempt', "Exempt granted to user $uid: $reason", 'presence');
    json_ok('Exempt status granted');
}

/* ─────────────── FLAG ─────────────── */
function action_flag(): never {
    require_method('POST');
    $u = auth_user(['MANAGER','HR','IT_ADMIN']);
    $b = body();
    $uid = i($b['user_id'] ?? 0);
    if (!$uid) json_error('user_id required');

    upsert_presence($uid, [
        'status'     => 'PRESENCE_DOUBT',
        'flagged_at' => date('Y-m-d H:i:s'),
    ]);
    audit_log($u['user_id'], 'presence_flag', "PRESENCE_DOUBT raised for user $uid", 'presence');
    json_ok('Flag raised');
}

/* ─────────────── CLEAR FLAG ─────────────── */
function action_clear_flag(): never {
    require_method('POST');
    $u = auth_user(['MANAGER','HR','IT_ADMIN']);
    $b = body();
    $uid = i($b['user_id'] ?? 0);
    if (!$uid) json_error('user_id required');

    upsert_presence($uid, [
        'status'       => 'CHECKED_IN',
        'flagged_at'   => null,
        'exempt_reason'=> null,
    ]);
    audit_log($u['user_id'], 'presence_clear', "Flag cleared for user $uid", 'presence');
    json_ok('Flag cleared');
}

/* ─────────────── HISTORY ─────────────── */
function action_history(): never {
    $u = auth_user(['MANAGER','HR','IT_ADMIN']);
    $uid  = i($_GET['user_id'] ?? 0);
    $limit = min((int)($_GET['limit'] ?? 50), 200);
    if (!$uid) json_error('user_id required');

    $rows = db()->prepare("
        SELECT h.*, qz.name AS zone_name
        FROM gps_heartbeats h
        LEFT JOIN qr_zones qz ON qz.id = h.zone_id
        WHERE h.user_id = ? AND h.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        ORDER BY h.created_at DESC
        LIMIT $limit
    ");
    $rows->execute([$uid]);
    json_ok($rows->fetchAll());
}
