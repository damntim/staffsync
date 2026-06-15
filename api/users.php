<?php
/**
 * StaffSync — users.php
 * Actions: list | get | update | deactivate | reactivate | change_role | change_password | bulk_invite
 */
require_once __DIR__ . '/config.php';

$action = $_GET['action'] ?? body()['action'] ?? '';

match($action) {
    'list'            => action_list(),
    'get'             => action_get(),
    'update'          => action_update(),
    'deactivate'      => action_deactivate(),
    'reactivate'      => action_reactivate(),
    'change_role'     => action_change_role(),
    'change_password' => action_change_password(),
    'bulk_invite'     => action_bulk_invite(),
    'reset_face'      => action_reset_face(),
    'delete_user'     => action_delete_user(),
    'pending'         => action_pending(),
    default           => json_error("Unknown action: $action"),
};

/* ─────────────────── LIST ─────────────────── */
function action_list(): never {
    require_method('GET');
    $u    = auth_user(['MANAGER','HR','IT_ADMIN']);
    $dept = $_GET['dept']   ?? null;
    $role = $_GET['role']   ?? null;
    $q    = $_GET['search'] ?? null;

    $sql    = 'SELECT u.id, u.email, u.employee_id, u.full_name, u.role, u.department,
                      u.phone, u.shift_start, u.shift_end, u.is_active, u.face_enrolled,
                      u.last_login, u.created_at
               FROM users u WHERE 1=1';
    $params = [];

    if ($dept) { $sql .= ' AND u.department = ?'; $params[] = $dept; }
    if ($role) { $sql .= ' AND u.role = ?'; $params[] = $role; }
    if ($q)    { $sql .= ' AND (u.full_name LIKE ? OR u.email LIKE ? OR u.employee_id LIKE ?)'; $params[] = "%$q%"; $params[] = "%$q%"; $params[] = "%$q%"; }

    $sql .= ' ORDER BY u.full_name LIMIT 200';
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    json_ok($stmt->fetchAll());
}

/* ─────────────────── GET ONE ─────────────────── */
function action_get(): never {
    require_method('GET');
    $u  = auth_user();
    $id = i($_GET['id'] ?? $u['user_id']);

    // Employees can only fetch themselves
    if ($id !== $u['user_id'] && !in_array($u['role'], ['MANAGER','HR','IT_ADMIN'])) {
        json_error('Forbidden', 403);
    }

    $stmt = db()->prepare(
        'SELECT u.*, fd.last_verified as face_last_verified
         FROM users u
         LEFT JOIN face_descriptors fd ON fd.user_id = u.id
         WHERE u.id = ? LIMIT 1'
    );
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_error('User not found', 404);

    // Never expose hash
    unset($row['password_hash']);
    json_ok($row);
}

/* ─────────────────── UPDATE (self or admin) ─────────────────── */
function action_update(): never {
    require_method('POST');
    $u  = auth_user();
    $b  = body();
    $id = i($b['id'] ?? $u['user_id']);

    if ($id !== $u['user_id'] && !in_array($u['role'], ['HR','IT_ADMIN'])) {
        json_error('Forbidden', 403);
    }

    $editable = ['full_name','phone','address','emergency_contact'];
    // Admin can also set department, shift, etc.
    if (in_array($u['role'], ['HR','IT_ADMIN'])) {
        $editable = array_merge($editable, ['department','shift_start','shift_end','email']);
    }

    $sets   = [];
    $params = [];
    foreach ($editable as $col) {
        if (array_key_exists($col, $b)) {
            $sets[]   = "$col = ?";
            $params[] = trim($b[$col]);
        }
    }
    if (!$sets) json_error('Nothing to update');

    $params[] = $id;
    db()->prepare('UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);

    audit_log($u['user_id'], 'user_update', "Profile updated for user $id", 'user');
    json_ok('Profile updated');
}

/* ─────────────────── DEACTIVATE ─────────────────── */
function action_deactivate(): never {
    require_method('POST');
    $u  = auth_user(['HR','IT_ADMIN']);
    $b  = body();
    $id = i($b['user_id'] ?? 0);
    if (!$id) json_error('user_id required');

    db()->prepare('UPDATE users SET is_active = 0 WHERE id = ?')->execute([$id]);
    // Revoke all active sessions
    db()->prepare('DELETE FROM active_sessions WHERE user_id = ?')->execute([$id]);

    audit_log($u['user_id'], 'user_deactivate', "User $id deactivated", 'user');
    json_ok('Account deactivated');
}

/* ─────────────────── REACTIVATE ─────────────────── */
function action_reactivate(): never {
    require_method('POST');
    $u  = auth_user(['HR','IT_ADMIN']);
    $b  = body();
    $id = i($b['user_id'] ?? 0);

    db()->prepare('UPDATE users SET is_active = 1, failed_logins = 0, locked_until = NULL WHERE id = ?')->execute([$id]);
    audit_log($u['user_id'], 'user_reactivate', "User $id reactivated", 'user');
    json_ok('Account reactivated');
}

/* ─────────────────── CHANGE ROLE ─────────────────── */
function action_change_role(): never {
    require_method('POST');
    $u  = auth_user(['HR','IT_ADMIN']);
    $b  = body();
    $id = i($b['user_id'] ?? 0);
    $role = strtoupper($b['role'] ?? '');

    $valid = ['EMPLOYEE','MANAGER','HR','IT_ADMIN','FINANCE'];
    if (!in_array($role, $valid)) json_error('Invalid role');

    $stmt = db()->prepare('SELECT role FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $old = $stmt->fetch();
    if (!$old) json_error('User not found', 404);

    db()->prepare('UPDATE users SET role = ? WHERE id = ?')->execute([$role, $id]);
    // Revoke sessions so user picks up new role on next login
    db()->prepare('DELETE FROM active_sessions WHERE user_id = ?')->execute([$id]);

    audit_log($u['user_id'], 'role_change', "User $id role: {$old['role']} → $role", 'rbac');
    json_ok('Role updated — user must re-login');
}

/* ─────────────────── CHANGE PASSWORD (self) ─────────────────── */
function action_change_password(): never {
    require_method('POST');
    $u = auth_user();
    $b = body();

    $current = $b['current_password'] ?? '';
    $newPass = $b['new_password']     ?? '';

    if (strlen($newPass) < 8) json_error('Password must be at least 8 characters');

    $stmt = db()->prepare('SELECT password_hash FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$u['user_id']]);
    $row = $stmt->fetch();

    if (!password_verify($current, $row['password_hash'])) json_error('Current password incorrect', 401);

    $hash = password_hash($newPass, PASSWORD_BCRYPT, ['cost' => 12]);
    db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([$hash, $u['user_id']]);

    audit_log($u['user_id'], 'password_change', 'Password changed', 'auth');
    json_ok('Password updated');
}

/* ─────────────────── BULK INVITE (CSV) ─────────────────── */
function action_bulk_invite(): never {
    require_method('POST');
    $u = auth_user(['HR','IT_ADMIN']);

    if (empty($_FILES['csv']['tmp_name'])) json_error('CSV file required');

    $handle = fopen($_FILES['csv']['tmp_name'], 'r');
    if (!$handle) json_error('Cannot read file');

    $header  = fgetcsv($handle);
    $results = ['sent' => [], 'skipped' => [], 'errors' => []];
    $count   = 0;

    while (($row = fgetcsv($handle)) !== false && $count < 100) {
        $data  = array_combine($header, $row);
        $email = strtolower(trim($data['email'] ?? ''));
        $name  = trim($data['name'] ?? '');
        $role  = strtoupper(trim($data['role'] ?? 'EMPLOYEE'));
        $dept  = trim($data['department'] ?? '');

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $results['errors'][] = "Invalid email: $email";
            continue;
        }

        // Check existing user
        $chk = db()->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
        $chk->execute([$email]);
        if ($chk->fetch()) { $results['skipped'][] = $email; continue; }

        // Check existing pending invite
        $dup = db()->prepare('SELECT id FROM invites WHERE email = ? AND status = "pending" AND expires_at > NOW() LIMIT 1');
        $dup->execute([$email]);
        if ($dup->fetch()) { $results['skipped'][] = "$email (pending invite exists)"; continue; }

        $token   = bin2hex(random_bytes(32));
        $expires = date('Y-m-d H:i:s', strtotime('+' . INVITE_EXPIRY_HOURS . ' hours'));

        db()->prepare(
            'INSERT INTO invites (email, full_name, role, department, token, invited_by, status, expires_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, "pending", ?, NOW())'
        )->execute([$email, $name, $role, $dept, $token, $u['user_id'], $expires]);

        $link = FRONTEND_URL . '/register?invite=' . $token;
        send_mail($email, $name, APP_NAME . ' — You\'ve been invited', "Hi $name,\n\nYou've been invited to StaffSync as $role.\n\nRegister here: $link\n\nLink expires in 7 days.");

        $results['sent'][] = $email;
        $count++;
    }

    fclose($handle);
    audit_log($u['user_id'], 'bulk_invite', count($results['sent']) . ' invites sent via CSV', 'user');
    json_ok($results);
}

/* ─────────────────── PENDING (stuck registrations) ─────────────────── */
function action_pending(): never {
    require_method('GET');
    auth_user(['HR','IT_ADMIN']);

    // Users who registered but haven't enrolled face yet (is_active=0, no face)
    $stmt = db()->query(
        'SELECT u.id, u.email, u.full_name, u.role, u.department, u.employee_id, u.created_at,
                u.is_active, u.face_enrolled
         FROM users u
         WHERE u.is_active = 0 OR u.face_enrolled = 0
         ORDER BY u.created_at DESC'
    );
    json_ok($stmt->fetchAll());
}

/* ─────────────────── RESET FACE (force re-enroll) ─────────────────── */
function action_reset_face(): never {
    require_method('POST');
    $u  = auth_user(['HR','IT_ADMIN']);
    $b  = body();
    $id = i($b['user_id'] ?? 0);
    if (!$id) json_error('user_id required');

    // Delete stored descriptor so user must re-enrol
    db()->prepare('DELETE FROM face_descriptors WHERE user_id = ?')->execute([$id]);
    db()->prepare('UPDATE users SET face_enrolled = 0, is_active = 0 WHERE id = ?')->execute([$id]);
    // Revoke sessions — user must go through enrolment again
    db()->prepare('DELETE FROM active_sessions WHERE user_id = ?')->execute([$id]);

    // Generate a fresh enrolment link using a short-lived token reusing invite system
    $enrolToken = bin2hex(random_bytes(16));
    db()->prepare('INSERT INTO password_resets (user_id, token, created_at, expires_at) VALUES (?,?,NOW(),DATE_ADD(NOW(), INTERVAL 24 HOUR))')
        ->execute([$id, hash('sha256', $enrolToken)]);

    $enrolLink = FRONTEND_URL . '/enroll-face?reset_token=' . $enrolToken;

    audit_log($u['user_id'], 'face_reset', "Face reset for user $id — must re-enrol", 'face');
    json_ok(['message' => 'Face data cleared — user must re-enrol', 'enrol_link' => $enrolLink]);
}

/* ─────────────────── DELETE USER ─────────────────── */
function action_delete_user(): never {
    require_method('POST');
    $u  = auth_user(['IT_ADMIN']);   // IT_ADMIN only — destructive
    $b  = body();
    $id = i($b['user_id'] ?? 0);
    if (!$id) json_error('user_id required');
    if ($id === $u['user_id']) json_error('Cannot delete your own account', 400);

    // Cascade delete
    db()->prepare('DELETE FROM face_descriptors WHERE user_id = ?')->execute([$id]);
    db()->prepare('DELETE FROM active_sessions WHERE user_id = ?')->execute([$id]);
    db()->prepare('DELETE FROM attendance WHERE user_id = ?')->execute([$id]);
    db()->prepare('UPDATE invites SET status = "revoked" WHERE email = (SELECT email FROM users WHERE id = ?)')
        ->execute([$id]);
    db()->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);

    audit_log($u['user_id'], 'user_delete', "User $id permanently deleted", 'user');
    json_ok('User deleted');
}
