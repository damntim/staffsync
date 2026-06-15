<?php
/**
 * StaffSync — face.php
 * Actions: enroll | verify | delete | status | list (admin)
 */
require_once __DIR__ . '/config.php';

$action = $_GET['action'] ?? body()['action'] ?? '';

match($action) {
    'enroll' => action_enroll(),
    'verify' => action_verify(),
    'delete' => action_delete(),
    'status' => action_status(),
    'list'   => action_list(),
    default  => json_error("Unknown action: $action"),
};

/* ─────────────────── ENROLL ─────────────────── */
function action_enroll(): never {
    require_method('POST');
    $u  = auth_user();
    $b  = body();
    $uid = i($b['user_id'] ?? $u['user_id']);

    // Only HR/IT can enroll another user's face
    if ($uid !== $u['user_id']) {
        auth_user(['HR','IT_ADMIN']);
    }

    $desc = $b['descriptor'] ?? [];
    if (!is_array($desc) || count($desc) !== 128) json_error('Expected 128-element float array');

    $consent = (bool)($b['gdpr_consent'] ?? false);
    if (!$consent) json_error('GDPR consent required');

    $enc   = encrypt_face(json_encode(array_map('floatval', $desc)));
    $stmt  = db()->prepare('SELECT id FROM face_descriptors WHERE user_id = ? LIMIT 1');
    $stmt->execute([$uid]);

    if ($stmt->fetch()) {
        db()->prepare('UPDATE face_descriptors SET descriptor_enc = ?, updated_at = NOW(), fail_count = 0, locked_until = NULL WHERE user_id = ?')
            ->execute([$enc, $uid]);
    } else {
        db()->prepare('INSERT INTO face_descriptors (user_id, descriptor_enc, gdpr_consent, created_at) VALUES (?, ?, 1, NOW())')
            ->execute([$uid, $enc]);
    }

    db()->prepare('UPDATE users SET face_enrolled = 1, is_active = 1 WHERE id = ?')->execute([$uid]);
    audit_log($u['user_id'], 'face_enroll', "Face enrolled for user $uid", 'face');
    json_ok('Face descriptor stored');
}

/* ─────────────────── VERIFY (returns distance only, decision in client) ── */
function action_verify(): never {
    require_method('POST');
    $u  = auth_user();
    $b  = body();
    $uid = i($b['user_id'] ?? $u['user_id']);

    $stmt = db()->prepare('SELECT descriptor_enc, fail_count, locked_until FROM face_descriptors WHERE user_id = ? LIMIT 1');
    $stmt->execute([$uid]);
    $row = $stmt->fetch();
    if (!$row) json_error('No face enrolled', 404);

    if ($row['locked_until'] && strtotime($row['locked_until']) > time()) {
        json_error('Face verification locked — contact HR', 401);
    }

    $incoming = $b['descriptor'] ?? [];
    if (!is_array($incoming) || count($incoming) !== 128) json_error('Invalid descriptor');

    $stored = json_decode(decrypt_face($row['descriptor_enc']), true);

    $dist = 0;
    foreach ($stored as $i => $v) $dist += ($v - ($incoming[$i] ?? 0)) ** 2;
    $dist = sqrt($dist);
    $THRESHOLD = 0.6;

    if ($dist <= $THRESHOLD) {
        db()->prepare('UPDATE face_descriptors SET fail_count = 0, locked_until = NULL, last_verified = NOW() WHERE user_id = ?')
            ->execute([$uid]);
        audit_log($u['user_id'], 'face_verify', 'Face match (dist=' . round($dist,4) . ')', 'face');
        json_ok(['match' => true, 'distance' => round($dist, 4)]);
    } else {
        $fails = $row['fail_count'] + 1;
        $lock  = $fails >= 3 ? date('Y-m-d H:i:s', strtotime('+30 minutes')) : null;
        db()->prepare('UPDATE face_descriptors SET fail_count = ?, locked_until = ? WHERE user_id = ?')
            ->execute([$fails, $lock, $uid]);
        audit_log($u['user_id'], 'face_verify', "Face mismatch (dist={$dist}, attempt={$fails})", 'face', 'warn');
        json_error('Face not matched', 401, ['match' => false, 'distance' => round($dist,4), 'attempts_left' => max(0, 3 - $fails)]);
    }
}

/* ─────────────────── DELETE descriptor ─────────────────── */
function action_delete(): never {
    require_method('POST');
    $u  = auth_user(['HR','IT_ADMIN']);
    $b  = body();
    $uid = i($b['user_id'] ?? 0);
    if (!$uid) json_error('user_id required');

    db()->prepare('DELETE FROM face_descriptors WHERE user_id = ?')->execute([$uid]);
    db()->prepare('UPDATE users SET face_enrolled = 0 WHERE id = ?')->execute([$uid]);

    audit_log($u['user_id'], 'face_delete', "Face descriptor deleted for user $uid", 'face');
    json_ok('Face descriptor deleted — re-enrollment required');
}

/* ─────────────────── STATUS ─────────────────── */
function action_status(): never {
    require_method('GET');
    $u  = auth_user();
    $uid = i($_GET['user_id'] ?? $u['user_id']);

    $stmt = db()->prepare(
        'SELECT fd.id, fd.last_verified, fd.fail_count, fd.locked_until, u.face_enrolled
         FROM users u
         LEFT JOIN face_descriptors fd ON fd.user_id = u.id
         WHERE u.id = ? LIMIT 1'
    );
    $stmt->execute([$uid]);
    json_ok($stmt->fetch());
}

/* ─────────────────── LIST (admin view) ─────────────────── */
function action_list(): never {
    require_method('GET');
    auth_user(['HR','IT_ADMIN']);

    $stmt = db()->query(
        'SELECT u.id, u.full_name, u.employee_id, u.department, u.face_enrolled,
                fd.last_verified, fd.fail_count, fd.locked_until
         FROM users u
         LEFT JOIN face_descriptors fd ON fd.user_id = u.id
         WHERE u.is_active = 1
         ORDER BY u.full_name'
    );
    json_ok($stmt->fetchAll());
}
