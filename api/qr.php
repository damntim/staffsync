<?php
/**
 * StaffSync — qr.php
 * Actions: generate | rotate | validate | list_zones | zones_public
 *          create_zone | update_zone | toggle_zone | geofence_check | scan_log
 *
 * Column aliasing: the original schema uses lat/lng/radius_m/current_token.
 * The migration adds latitude/longitude/radius_metres/token/address/created_by/scan_count.
 * normalize_zone() sets canonical keys so the rest of the code works regardless.
 */
require_once __DIR__ . '/config.php';

$action = $_GET['action'] ?? body()['action'] ?? '';

match($action) {
    'generate'       => action_generate(),
    'rotate'         => action_rotate(),
    'validate'       => action_validate(),
    'list_zones'     => action_list_zones(),
    'zones_public'   => action_zones_public(),
    'create_zone'    => action_create_zone(),
    'update_zone'    => action_update_zone(),
    'toggle_zone'    => action_toggle_zone(),
    'geofence_check' => action_geofence_check(),
    'scan_log'       => action_scan_log(),
    default          => json_error("Unknown action: $action"),
};

/* ── Canonical zone keys (handles old AND new column names) ── */
function normalize_zone(array $z): array {
    // latitude — prefer new column, fall back to old `lat`
    $z['latitude']      = $z['latitude']      ?? $z['lat']           ?? null;
    $z['longitude']     = $z['longitude']      ?? $z['lng']           ?? null;
    $z['radius_metres'] = $z['radius_metres']  ?? $z['radius_m']      ?? 200;
    $z['token']         = $z['token']          ?? $z['current_token'] ?? null;
    $z['address']       = $z['address']        ?? null;
    $z['scan_count']    = $z['scan_count']     ?? 0;
    return $z;
}

/* ── Token column name (old = current_token, new = token) ── */
function token_col(): string {
    static $col = null;
    if ($col) return $col;
    $r = db()->query("SHOW COLUMNS FROM qr_zones LIKE 'token'");
    $col = $r->fetch() ? 'token' : 'current_token';
    return $col;
}

function rotate_zone(int $zoneId): array {
    $newToken = bin2hex(random_bytes(24));
    $expires  = date('Y-m-d H:i:s', time() + QR_ROTATE_SECONDS);
    $col      = token_col();
    db()->prepare("UPDATE qr_zones SET `$col` = ?, token_expires_at = ? WHERE id = ?")
        ->execute([$newToken, $expires, $zoneId]);
    return fetch_zone($zoneId);
}

function fetch_zone(int $id): array|false {
    $stmt = db()->prepare('SELECT * FROM qr_zones WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ? normalize_zone($row) : false;
}

function zone_token_valid(array $zone): bool {
    return $zone['token'] && strtotime($zone['token_expires_at']) > time();
}

/* ─────────────────── GENERATE ─────────────────── */
function action_generate(): never {
    require_method('GET');
    auth_user(['HR','IT_ADMIN']);

    $zoneId = i($_GET['zone_id'] ?? 0);
    if (!$zoneId) json_error('zone_id required');

    $zone = fetch_zone($zoneId);
    if (!$zone)            json_error('Zone not found', 404);
    if (!$zone['is_active']) json_error('Zone is disabled');

    if (!zone_token_valid($zone)) $zone = rotate_zone($zoneId);

    json_ok([
        'zone_id'      => $zone['id'],
        'zone_name'    => $zone['name'],
        'token'        => $zone['token'],
        'expires_at'   => $zone['token_expires_at'],
        'seconds_left' => max(0, strtotime($zone['token_expires_at']) - time()),
    ]);
}

/* ─────────────────── FORCE ROTATE ─────────────────── */
function action_rotate(): never {
    require_method('POST');
    $u      = auth_user(['HR','IT_ADMIN']);
    $b      = body();
    $zoneId = i($b['zone_id'] ?? 0);
    if (!$zoneId) json_error('zone_id required');

    $zone = rotate_zone($zoneId);
    audit_log($u['user_id'], 'qr_rotate', "QR zone $zoneId token force-rotated", 'checkin');
    json_ok(['token' => $zone['token'], 'expires_at' => $zone['token_expires_at']]);
}

/* ─────────────────── VALIDATE ─────────────────── */
function action_validate(): never {
    require_method('POST');
    $u = auth_user();
    $b = body();

    $token = $b['token'] ?? '';
    $lat   = f($b['lat'] ?? 0);
    $lng   = f($b['lng'] ?? 0);

    if (!$token) json_error('Token required');

    // Find zone by token (check both column names)
    $col  = token_col();
    $stmt = db()->prepare("SELECT * FROM qr_zones WHERE `$col` = ? AND is_active = 1 LIMIT 1");
    $stmt->execute([$token]);
    $row = $stmt->fetch();
    if (!$row) {
        audit_log($u['user_id'], 'qr_validate', 'QR token invalid', 'checkin', 'error');
        json_error('QR token invalid or expired', 400);
    }
    $zone = normalize_zone($row);

    if (!zone_token_valid($zone)) {
        json_error('QR token expired — please wait for the next rotation', 400);
    }

    // Geofence check
    $inZone = true;
    if ($zone['latitude'] && $lat) {
        $inZone = within_geofence($lat, $lng, (float)$zone['latitude'], (float)$zone['longitude'], (float)$zone['radius_metres']);
    }

    // Log scan
    db()->prepare('INSERT INTO qr_scan_log (user_id, zone_id, scanned_at, lat, lng, geofence_pass) VALUES (?,?,NOW(),?,?,?)')
        ->execute([$u['user_id'], $zone['id'], $lat ?: null, $lng ?: null, (int)$inZone]);

    if (!$inZone) {
        audit_log($u['user_id'], 'qr_validate', "Outside geofence {$zone['name']}", 'checkin', 'warn');
        json_error('You are outside the allowed geofence zone', 403, ['zone_name' => $zone['name'], 'geofence_fail' => true]);
    }

    // Bump scan count if column exists
    try {
        db()->prepare('UPDATE qr_zones SET scan_count = scan_count + 1 WHERE id = ?')->execute([$zone['id']]);
    } catch (PDOException) { /* column may not exist yet */ }

    audit_log($u['user_id'], 'qr_validate', "QR+geo passed — {$zone['name']}", 'checkin');
    json_ok(['valid' => true, 'zone_id' => $zone['id'], 'zone_name' => $zone['name']]);
}

/* ─────────────────── LIST ZONES (HR / IT_ADMIN) ─────────────────── */
function action_list_zones(): never {
    require_method('GET');
    auth_user(['HR','IT_ADMIN']);

    $stmt  = db()->query('SELECT * FROM qr_zones ORDER BY name');
    $zones = array_map('normalize_zone', $stmt->fetchAll());

    foreach ($zones as &$zone) {
        if ($zone['is_active'] && !zone_token_valid($zone)) {
            $rotated = rotate_zone((int)$zone['id']);
            $zone['token']            = $rotated['token'];
            $zone['token_expires_at'] = $rotated['token_expires_at'];
        }
        $zone['seconds_left'] = $zone['token_expires_at']
            ? max(0, strtotime($zone['token_expires_at']) - time())
            : 0;
    }

    json_ok($zones);
}

/* ─────────────────── PUBLIC ZONES (any authenticated user) ─────────────── */
function action_zones_public(): never {
    require_method('GET');
    auth_user();

    $stmt  = db()->query('SELECT * FROM qr_zones WHERE is_active = 1 ORDER BY name');
    $zones = array_map('normalize_zone', $stmt->fetchAll());

    foreach ($zones as &$zone) {
        if (!zone_token_valid($zone)) {
            $rotated = rotate_zone((int)$zone['id']);
            $zone['token']            = $rotated['token'];
            $zone['token_expires_at'] = $rotated['token_expires_at'];
        }
        $zone['seconds_left'] = $zone['token_expires_at']
            ? max(0, strtotime($zone['token_expires_at']) - time())
            : 0;
    }

    json_ok($zones);
}

/* ─────────────────── CREATE ZONE ─────────────────── */
function action_create_zone(): never {
    require_method('POST');
    $u = auth_user(['HR','IT_ADMIN']);
    $b = body();

    $name = trim($b['name'] ?? '');
    if (!$name) json_error('Zone name required');

    $newToken = bin2hex(random_bytes(24));
    $expires  = date('Y-m-d H:i:s', time() + QR_ROTATE_SECONDS);
    $col      = token_col();

    // Build INSERT dynamically to handle optional columns gracefully
    $cols   = ['name', 'is_active', "`$col`", 'token_expires_at', 'grace_period_min', 'created_at'];
    $vals   = [$name, 1, $newToken, $expires, i($b['grace_period_min'] ?? 10), date('Y-m-d H:i:s')];
    $marks  = ['?','?','?','?','?','?'];

    // Optional columns — add only if they exist in the table
    $optionals = [
        'address'       => trim($b['address'] ?? ''),
        'latitude'      => f($b['latitude']  ?? 0) ?: null,
        'longitude'     => f($b['longitude'] ?? 0) ?: null,
        'radius_metres' => i($b['radius_metres'] ?? 200),
        'lat'           => f($b['latitude']  ?? 0) ?: null,
        'lng'           => f($b['longitude'] ?? 0) ?: null,
        'radius_m'      => i($b['radius_metres'] ?? 200),
        'created_by'    => $u['user_id'],
    ];

    $existsCache = [];
    foreach ($optionals as $optCol => $optVal) {
        $key = $optCol;
        if (!isset($existsCache[$key])) {
            $r = db()->query("SHOW COLUMNS FROM qr_zones LIKE '$key'");
            $existsCache[$key] = (bool)$r->fetch();
        }
        if ($existsCache[$key]) {
            $cols[]  = "`$optCol`";
            $vals[]  = $optVal;
            $marks[] = '?';
        }
    }

    $sql = 'INSERT INTO qr_zones (' . implode(', ', $cols) . ') VALUES (' . implode(', ', $marks) . ')';
    db()->prepare($sql)->execute($vals);
    $zoneId = (int)db()->lastInsertId();

    audit_log($u['user_id'], 'zone_create', "QR zone '$name' created", 'geofence');
    json_ok(['zone_id' => $zoneId, 'token' => $newToken], 201);
}

/* ─────────────────── UPDATE ZONE ─────────────────── */
function action_update_zone(): never {
    require_method('POST');
    $u      = auth_user(['HR','IT_ADMIN']);
    $b      = body();
    $zoneId = i($b['zone_id'] ?? 0);
    if (!$zoneId) json_error('zone_id required');

    // Map of request key → possible DB column names (preferred first)
    $fieldMap = [
        'name'             => ['name'],
        'address'          => ['address'],
        'latitude'         => ['latitude', 'lat'],
        'longitude'        => ['longitude', 'lng'],
        'radius_metres'    => ['radius_metres', 'radius_m'],
        'grace_period_min' => ['grace_period_min'],
    ];

    $sets   = [];
    $params = [];

    foreach ($fieldMap as $reqKey => $candidates) {
        if (!array_key_exists($reqKey, $b)) continue;
        foreach ($candidates as $dbCol) {
            $r = db()->query("SHOW COLUMNS FROM qr_zones LIKE '$dbCol'");
            if ($r->fetch()) {
                $sets[]   = "`$dbCol` = ?";
                $params[] = $b[$reqKey];
                break; // use first existing column
            }
        }
    }

    if (!$sets) json_error('Nothing to update');

    $params[] = $zoneId;
    db()->prepare('UPDATE qr_zones SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);

    audit_log($u['user_id'], 'zone_update', "QR zone $zoneId updated", 'geofence');
    json_ok('Zone updated');
}

/* ─────────────────── TOGGLE ZONE ─────────────────── */
function action_toggle_zone(): never {
    require_method('POST');
    $u      = auth_user(['HR','IT_ADMIN']);
    $b      = body();
    $zoneId = i($b['zone_id'] ?? 0);

    $stmt = db()->prepare('SELECT is_active FROM qr_zones WHERE id = ? LIMIT 1');
    $stmt->execute([$zoneId]);
    $zone = $stmt->fetch();
    if (!$zone) json_error('Zone not found', 404);

    $newState = $zone['is_active'] ? 0 : 1;
    db()->prepare('UPDATE qr_zones SET is_active = ? WHERE id = ?')->execute([$newState, $zoneId]);

    audit_log($u['user_id'], 'zone_toggle', "QR zone $zoneId " . ($newState ? 'enabled' : 'disabled'), 'geofence');
    json_ok(['is_active' => $newState]);
}

/* ─────────────────── GEOFENCE CHECK ─────────────────── */
function action_geofence_check(): never {
    require_method('POST');
    auth_user();
    $b = body();

    $lat    = f($b['lat'] ?? 0);
    $lng    = f($b['lng'] ?? 0);
    $zoneId = i($b['zone_id'] ?? 0);

    if (!$lat || !$lng) json_error('lat and lng required');

    $zone = $zoneId ? fetch_zone($zoneId) : null;
    if ($zoneId && !$zone) json_error('Zone not found', 404);

    if ($zone) {
        $inside = within_geofence($lat, $lng, (float)$zone['latitude'], (float)$zone['longitude'], (float)$zone['radius_metres']);
        json_ok(['in_zone' => $inside, 'zone_name' => $zone['name'], 'radius_m' => $zone['radius_metres']]);
    }

    // Check all active zones
    $stmt  = db()->query('SELECT * FROM qr_zones WHERE is_active = 1');
    $zones = array_map('normalize_zone', $stmt->fetchAll());
    $results = [];
    foreach ($zones as $z) {
        if (!$z['latitude']) continue;
        $inside = within_geofence($lat, $lng, (float)$z['latitude'], (float)$z['longitude'], (float)$z['radius_metres']);
        $results[] = ['zone_id' => $z['id'], 'zone_name' => $z['name'], 'in_zone' => $inside];
    }
    json_ok($results);
}

/* ─────────────────── SCAN LOG ─────────────────── */
function action_scan_log(): never {
    require_method('GET');
    auth_user(['HR','IT_ADMIN']);

    $zoneId = i($_GET['zone_id'] ?? 0);
    $limit  = min(i($_GET['limit'] ?? 50), 200);

    $sql    = 'SELECT sl.*, u.full_name, u.employee_id, z.name as zone_name
               FROM qr_scan_log sl
               JOIN users u ON u.id = sl.user_id
               JOIN qr_zones z ON z.id = sl.zone_id';
    $params = [];
    if ($zoneId) { $sql .= ' WHERE sl.zone_id = ?'; $params[] = $zoneId; }
    $sql .= ' ORDER BY sl.scanned_at DESC LIMIT ' . $limit;

    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    json_ok($stmt->fetchAll());
}
