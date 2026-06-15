<?php
/**
 * StaffSync — auth.php
 * Actions: login | logout | register | face_enroll | face_verify | invite_send
 *          invite_list | invite_resend | invite_revoke | password_reset_request
 *          password_reset | session_list | session_revoke | me
 */
require_once __DIR__ . '/config.php';

$action = $_GET['action'] ?? body()['action'] ?? '';

match($action) {
    'login'                  => action_login(),
    'logout'                 => action_logout(),
    'register'               => action_register(),
    'invite_verify'          => action_invite_verify(),
    'face_enroll'            => action_face_enroll(),
    'face_verify'            => action_face_verify(),
    'invite_send'            => action_invite_send(),
    'invite_list'            => action_invite_list(),
    'invite_resend'          => action_invite_resend(),
    'invite_revoke'          => action_invite_revoke(),
    'password_reset_request' => action_password_reset_request(),
    'password_reset'         => action_password_reset(),
    'me'                     => action_me(),
    default                  => json_error("Unknown action: $action", 400),
};

/* ─────────────────────────────── LOGIN ─────────────────────────────── */
function action_login(): never {
    require_method('POST');
    $b = body();
    $email    = strtolower(trim($b['email'] ?? ''));
    $password = $b['password'] ?? '';

    if (!$email || !$password) json_error('Email and password required');

    $stmt = db()->prepare(
        'SELECT id, email, employee_id, full_name, role, department, shift_start, shift_end,
                password_hash, is_active, locked_until, failed_logins
         FROM users WHERE email = ? LIMIT 1'
    );
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user) json_error('Invalid credentials', 401);
    if (!$user['is_active']) json_error('Account deactivated — contact HR', 401);

    // Lockout check
    if ($user['locked_until'] && strtotime($user['locked_until']) > time()) {
        $wait = ceil((strtotime($user['locked_until']) - time()) / 60);
        json_error("Account locked — try again in {$wait} minute(s)", 401);
    }

    if (!password_verify($password, $user['password_hash'])) {
        $attempts = $user['failed_logins'] + 1;
        $lockUntil = $attempts >= 5 ? date('Y-m-d H:i:s', strtotime('+15 minutes')) : null;
        db()->prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?')
            ->execute([$attempts, $lockUntil, $user['id']]);
        audit_log($user['id'], 'login', "Failed password attempt #{$attempts}", 'auth', 'warn');
        json_error('Invalid credentials', 401);
    }

    // Reset attempts on success
    db()->prepare('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login = NOW() WHERE id = ?')
        ->execute([$user['id']]);

    $token = issue_session($user);
    audit_log($user['id'], 'login', 'Login successful', 'auth');

    json_ok([
        'token' => $token,
        'user'  => [
            'id'          => $user['id'],
            'email'       => $user['email'],
            'employee_id' => $user['employee_id'],
            'full_name'   => $user['full_name'],
            'role'        => $user['role'],
            'department'  => $user['department'],
            'shift_start' => $user['shift_start'],
            'shift_end'   => $user['shift_end'],
        ],
    ]);
}

function issue_session(array $user): string {
    $payload = [
        'user_id'     => $user['id'],
        'email'       => $user['email'],
        'employee_id' => $user['employee_id'],
        'role'        => $user['role'],
    ];
    $token = jwt_encode($payload);
    $hash  = hash('sha256', $token);
    $ip    = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '—';
    $ua    = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255);
    $exp   = date('Y-m-d H:i:s', time() + JWT_EXPIRY);

    db()->prepare(
        'INSERT INTO active_sessions (user_id, token_hash, ip_address, user_agent, expires_at)
         VALUES (?, ?, ?, ?, ?)'
    )->execute([$user['id'], $hash, $ip, $ua, $exp]);

    return $token;
}

/* ─────────────────────────────── LOGOUT ────────────────────────────── */
function action_logout(): never {
    require_method('POST');
    $u = auth_user();
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    $token  = substr($header, 7);
    db()->prepare('DELETE FROM active_sessions WHERE token_hash = ?')->execute([hash('sha256', $token)]);
    audit_log($u['user_id'], 'logout', 'Session terminated', 'auth');
    json_ok('Logged out');
}

/* ─────────────────────────────── INVITE VERIFY (public) ────────────── */
function action_invite_verify(): never {
    $token = $_GET['token'] ?? '';
    if (!$token) json_error('Token required', 400);

    $stmt = db()->prepare(
        'SELECT i.email, i.full_name, i.role, i.department, i.expires_at, i.status,
                ib.full_name AS invited_by_name
         FROM invites i
         LEFT JOIN users ib ON ib.id = i.invited_by
         WHERE i.token = ? LIMIT 1'
    );
    $stmt->execute([$token]);
    $row = $stmt->fetch();
    if (!$row) json_error('Invite not found', 404);
    if (strtotime($row['expires_at']) < time()) json_error('Invite expired — contact your administrator', 400);

    // If accepted but user hasn't enrolled face yet → let them resume enrollment
    if ($row['status'] === 'accepted') {
        $uStmt = db()->prepare(
            'SELECT id, email, employee_id, full_name, role, department FROM users
             WHERE email = ? AND face_enrolled = 0 LIMIT 1'
        );
        $uStmt->execute([$row['email']]);
        $stuck = $uStmt->fetch();

        if ($stuck) {
            // Issue a fresh JWT so the user can reach /enroll-face
            $resumeToken = issue_session($stuck);
            json_ok([
                'resume'      => true,
                'token'       => $resumeToken,
                'user'        => $stuck,
                'message'     => 'Registration already done — resuming face enrollment',
            ]);
        }
        json_error('Invite already accepted and account is active — please sign in', 400);
    }

    if ($row['status'] !== 'pending') json_error('Invite already ' . $row['status'], 400);

    json_ok([
        'email'           => $row['email'],
        'full_name'       => $row['full_name'],
        'role'            => $row['role'],
        'department'      => $row['department'],
        'expires_at'      => $row['expires_at'],
        'invited_by_name' => $row['invited_by_name'] ?? 'HR',
    ]);
}

/* ─────────────────────────────── REGISTER ──────────────────────────── */
function action_register(): never {
    require_method('POST');
    $b = body();

    $inviteToken = $b['invite_token'] ?? '';
    if (!$inviteToken) json_error('Invite token required');

    $stmt = db()->prepare(
        'SELECT * FROM invites WHERE token = ? AND status = "pending" AND expires_at > NOW() LIMIT 1'
    );
    $stmt->execute([$inviteToken]);
    $invite = $stmt->fetch();
    if (!$invite) json_error('Invite invalid, expired, or already used', 400);

    $email    = strtolower(trim($b['email'] ?? ''));
    $fullName = trim($b['full_name'] ?? '');
    $password = $b['password'] ?? '';

    if ($email !== strtolower($invite['email'])) json_error('Email does not match invite', 400);
    if (!$fullName) json_error('Full name required');
    if (strlen($password) < 8) json_error('Password must be at least 8 characters');

    // Check email uniqueness
    $check = db()->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
    $check->execute([$email]);
    if ($check->fetch()) json_error('Email already registered', 409);

    // Generate employee ID
    $countStmt = db()->query('SELECT COUNT(*) as c FROM users');
    $empNum    = ($countStmt->fetch()['c'] ?? 0) + 1;
    $empId     = 'EMP-' . str_pad($empNum, 3, '0', STR_PAD_LEFT);

    $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

    $ins = db()->prepare(
        'INSERT INTO users (email, employee_id, full_name, role, department, password_hash, is_active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, NOW())'
    );
    $ins->execute([$email, $empId, $fullName, $invite['role'], $invite['department'], $hash]);
    $userId = (int) db()->lastInsertId();

    // Mark invite accepted
    db()->prepare('UPDATE invites SET status = "accepted", accepted_at = NOW() WHERE id = ?')
        ->execute([$invite['id']]);

    // Issue JWT so the new user can immediately enrol their face
    $newUser = [
        'id'          => $userId,
        'email'       => $email,
        'employee_id' => $empId,
        'role'        => $invite['role'],
        'department'  => $invite['department'],
        'full_name'   => $fullName,
    ];
    $token = issue_session($newUser);

    audit_log($userId, 'register', "Account created via invite — $email", 'auth');
    json_ok([
        'user_id'     => $userId,
        'employee_id' => $empId,
        'token'       => $token,
        'user'        => $newUser,
        'message'     => 'Registration complete — please enrol your face',
    ], 201);
}

/* ─────────────────────────────── FACE ENROLL ───────────────────────── */
function action_face_enroll(): never {
    require_method('POST');
    $b = body();

    // Allow enroll via user_id (pre-auth during onboarding) or JWT
    $userId = i($b['user_id'] ?? 0);
    if (!$userId) {
        $u      = auth_user();
        $userId = $u['user_id'];
    }

    $descriptor128 = $b['descriptor'] ?? null;
    if (!$descriptor128 || !is_array($descriptor128) || count($descriptor128) !== 128) {
        json_error('Invalid face descriptor — expected 128-element float array');
    }

    $json       = json_encode($descriptor128);
    $encrypted  = encrypt_face($json);
    $consent    = (bool)($b['gdpr_consent'] ?? false);
    if (!$consent) json_error('GDPR consent required for biometric storage');

    // Upsert descriptor
    $stmt = db()->prepare('SELECT id FROM face_descriptors WHERE user_id = ? LIMIT 1');
    $stmt->execute([$userId]);
    $existing = $stmt->fetch();

    if ($existing) {
        db()->prepare('UPDATE face_descriptors SET descriptor_enc = ?, updated_at = NOW() WHERE user_id = ?')
            ->execute([$encrypted, $userId]);
    } else {
        db()->prepare(
            'INSERT INTO face_descriptors (user_id, descriptor_enc, gdpr_consent, created_at) VALUES (?, ?, 1, NOW())'
        )->execute([$userId, $encrypted]);
    }

    // Activate account after face enroll
    db()->prepare('UPDATE users SET is_active = 1, face_enrolled = 1 WHERE id = ?')->execute([$userId]);

    audit_log($userId, 'face_enroll', 'Face descriptor enrolled/updated', 'face');
    json_ok('Face enrolled successfully');
}

/* ─────────────────────────────── FACE VERIFY ───────────────────────── */
function action_face_verify(): never {
    require_method('POST');
    $b          = auth_user();   // must already have a login token (step 2)
    $bd         = body();
    $userId     = $b['user_id'];
    $incoming   = $bd['descriptor'] ?? [];

    if (!is_array($incoming) || count($incoming) !== 128) json_error('Invalid descriptor');

    $stmt = db()->prepare('SELECT descriptor_enc, fail_count, locked_until FROM face_descriptors WHERE user_id = ? LIMIT 1');
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    if (!$row) json_error('No face enrolled — contact HR', 403);

    if ($row['locked_until'] && strtotime($row['locked_until']) > time()) {
        json_error('Face verification locked — contact HR', 401);
    }

    $stored = json_decode(decrypt_face($row['descriptor_enc']), true);

    // Euclidean distance
    $dist = 0;
    foreach ($stored as $i => $v) $dist += ($v - ($incoming[$i] ?? 0)) ** 2;
    $dist = sqrt($dist);
    $THRESHOLD = 0.6;

    if ($dist <= $THRESHOLD) {
        db()->prepare('UPDATE face_descriptors SET fail_count = 0, locked_until = NULL, last_verified = NOW() WHERE user_id = ?')
            ->execute([$userId]);
        db()->prepare('UPDATE users SET last_login = COALESCE(last_login, NOW()) WHERE id = ?')->execute([$userId]);
        audit_log($userId, 'face_verify', 'Face verified (dist=' . round($dist,4) . ')', 'face');
        json_ok(['verified' => true, 'distance' => round($dist, 4)]);
    } else {
        $fails = $row['fail_count'] + 1;
        $lock  = $fails >= 3 ? date('Y-m-d H:i:s', strtotime('+30 minutes')) : null;
        db()->prepare('UPDATE face_descriptors SET fail_count = ?, locked_until = ? WHERE user_id = ?')
            ->execute([$fails, $lock, $userId]);
        audit_log($userId, 'face_verify', "Face mismatch (dist={$dist}, attempt={$fails})", 'face', 'warn');
        json_error('Face verification failed — attempt ' . $fails . '/3', 401, ['attempts_left' => 3 - $fails]);
    }
}

/* ─────────────────────────────── INVITE SEND ───────────────────────── */
function action_invite_send(): never {
    require_method('POST');
    $u = auth_user(['HR','IT_ADMIN']);
    $b = body();

    $email = strtolower(trim($b['email'] ?? ''));
    $name  = trim($b['name'] ?? '');
    $role  = strtoupper($b['role'] ?? 'EMPLOYEE');
    $dept  = trim($b['department'] ?? '');

    $validRoles = ['EMPLOYEE','MANAGER','HR','IT_ADMIN'];
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Invalid email');
    if (!$name) json_error('Name required');
    if (!in_array($role, $validRoles)) json_error('Invalid role');

    // Check no pending invite already
    $dup = db()->prepare('SELECT id FROM invites WHERE email = ? AND status = "pending" AND expires_at > NOW() LIMIT 1');
    $dup->execute([$email]);
    if ($dup->fetch()) json_error('A pending invite already exists for this email', 409);

    $token   = bin2hex(random_bytes(32));
    $expires = date('Y-m-d H:i:s', strtotime('+' . INVITE_EXPIRY_HOURS . ' hours'));

    db()->prepare(
        'INSERT INTO invites (email, full_name, role, department, token, invited_by, status, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, "pending", ?, NOW())'
    )->execute([$email, $name, $role, $dept, $token, $u['user_id'], $expires]);

    $inviteId = (int) db()->lastInsertId();
    $link     = FRONTEND_URL . '/register?invite=' . $token;

    send_invite_email($email, $name, $link, $role);

    audit_log($u['user_id'], 'invite_send', "Invite sent to $email as $role", 'user');
    json_ok(['invite_id' => $inviteId, 'link' => $link], 201);
}

function send_invite_email(string $to, string $name, string $link, string $role): void {
    $subject  = APP_NAME . ' — You\'ve been invited to join DevX Ltd';
    $roleNice = str_replace('_', ' ', ucwords(strtolower($role)));
    $hours    = INVITE_EXPIRY_HOURS;

    $html = <<<HTML
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#060912;font-family:sans-serif;">
<div style="max-width:560px;margin:40px auto;background:#0d1117;border:1px solid rgba(99,102,241,0.25);border-radius:16px;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px;text-align:center;">
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">StaffSync</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">DevX Ltd — Workforce Platform</p>
  </div>
  <div style="padding:32px;">
    <h2 style="color:#e2e8f0;font-size:18px;margin:0 0 8px;">Hi {$name},</h2>
    <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 24px;">
      You've been invited to join <strong style="color:#818cf8;">StaffSync</strong> as a
      <strong style="color:#a78bfa;">{$roleNice}</strong>.
      Complete your registration using the button below — the link expires in <strong>{$hours} hours</strong>.
    </p>
    <div style="text-align:center;margin:28px 0;">
      <a href="{$link}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:14px;font-weight:700;letter-spacing:0.3px;">
        Accept Invitation &amp; Register
      </a>
    </div>
    <p style="color:#475569;font-size:11px;line-height:1.6;margin:24px 0 0;word-break:break-all;">
      Or copy this link:<br>
      <a href="{$link}" style="color:#818cf8;">{$link}</a>
    </p>
    <hr style="border:none;border-top:1px solid rgba(99,102,241,0.12);margin:24px 0;">
    <p style="color:#475569;font-size:11px;margin:0;">
      If you did not expect this email, you can safely ignore it. No account will be created unless you follow the link above.
    </p>
  </div>
  <div style="background:#0a0e1a;padding:16px;text-align:center;">
    <p style="color:#475569;font-size:10px;margin:0;">DevX Ltd · StaffSync HR Platform</p>
  </div>
</div>
</body></html>
HTML;

    $plain = "Hi $name,\n\nYou have been invited to register on StaffSync as $roleNice.\n\nComplete your registration here (expires in {$hours} hours):\n{$link}\n\nIf you did not expect this email, please ignore it.\n\n— DevX Ltd";

    send_mail($to, $name, $subject, $html, $plain);
}

/* ─────────────────────────────── INVITE LIST ───────────────────────── */
function action_invite_list(): never {
    require_method('GET');
    auth_user(['HR','IT_ADMIN']);

    $status = $_GET['status'] ?? 'all';
    $sql    = 'SELECT i.*, u.full_name as invited_by_name FROM invites i
               LEFT JOIN users u ON u.id = i.invited_by';
    $params = [];

    if ($status !== 'all') {
        $sql   .= ' WHERE i.status = ?';
        $params[] = $status;
    }
    $sql .= ' ORDER BY i.created_at DESC LIMIT 100';

    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    json_ok($stmt->fetchAll());
}

/* ─────────────────────────────── INVITE RESEND ─────────────────────── */
function action_invite_resend(): never {
    require_method('POST');
    $u = auth_user(['HR','IT_ADMIN']);
    $b = body();
    $id = i($b['invite_id'] ?? 0);
    if (!$id) json_error('invite_id required');

    $stmt = db()->prepare('SELECT * FROM invites WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $inv = $stmt->fetch();
    if (!$inv) json_error('Invite not found', 404);

    $token   = bin2hex(random_bytes(32));
    $expires = date('Y-m-d H:i:s', strtotime('+' . INVITE_EXPIRY_HOURS . ' hours'));
    db()->prepare('UPDATE invites SET token = ?, status = "pending", expires_at = ?, sent_at = NOW() WHERE id = ?')
        ->execute([$token, $expires, $id]);

    $link = FRONTEND_URL . '/register?invite=' . $token;
    send_invite_email($inv['email'], $inv['full_name'], $link, $inv['role']);
    audit_log($u['user_id'], 'invite_resend', "Invite resent to {$inv['email']}", 'user');
    json_ok(['link' => $link]);
}

/* ─────────────────────────────── INVITE REVOKE ─────────────────────── */
function action_invite_revoke(): never {
    require_method('POST');
    $u = auth_user(['HR','IT_ADMIN']);
    $b = body();
    $id = i($b['invite_id'] ?? 0);

    db()->prepare('UPDATE invites SET status = "revoked" WHERE id = ?')->execute([$id]);
    audit_log($u['user_id'], 'invite_revoke', "Invite $id revoked", 'user');
    json_ok('Revoked');
}

/* ─────────────────────────────── PASSWORD RESET ────────────────────── */
function action_password_reset_request(): never {
    require_method('POST');
    $b     = body();
    $email = strtolower(trim($b['email'] ?? ''));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Invalid email');

    $stmt = db()->prepare('SELECT id, full_name FROM users WHERE email = ? AND is_active = 1 LIMIT 1');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    // Always respond with same message to prevent enumeration
    if ($user) {
        $token   = bin2hex(random_bytes(32));
        $expires = date('Y-m-d H:i:s', strtotime('+1 hour'));
        db()->prepare(
            'INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE token = VALUES(token), expires_at = VALUES(expires_at)'
        )->execute([$user['id'], $token, $expires]);

        $link     = FRONTEND_URL . '/reset-password?token=' . $token;
        $name     = $user['full_name'];
        $htmlPw   = <<<HTML
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#060912;font-family:sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#0d1117;border:1px solid rgba(99,102,241,0.2);border-radius:16px;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:24px;text-align:center;">
    <h1 style="margin:0;color:#fff;font-size:20px;">StaffSync</h1>
  </div>
  <div style="padding:28px;">
    <h2 style="color:#e2e8f0;font-size:16px;margin:0 0 8px;">Password Reset Request</h2>
    <p style="color:#94a3b8;font-size:13px;line-height:1.6;margin:0 0 20px;">Hi {$name}, click the button below to reset your password. This link expires in <strong>1 hour</strong>.</p>
    <div style="text-align:center;margin:20px 0;">
      <a href="{$link}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:13px;font-weight:700;">Reset Password</a>
    </div>
    <p style="color:#475569;font-size:11px;margin:16px 0 0;">If you did not request this, ignore this email — your password will remain unchanged.</p>
  </div>
</div>
</body></html>
HTML;
        $plainPw = "Hi {$name},\n\nReset your StaffSync password:\n{$link}\n\nExpires in 1 hour. If you did not request this, ignore this email.";
        send_mail($email, $name, 'StaffSync — Password Reset', $htmlPw, $plainPw);
    }

    json_ok('If that email exists, a reset link has been sent');
}

function action_password_reset(): never {
    require_method('POST');
    $b       = body();
    $token   = $b['token'] ?? '';
    $newPass = $b['password'] ?? '';

    if (strlen($newPass) < 8) json_error('Password must be at least 8 characters');

    $stmt = db()->prepare(
        'SELECT pr.user_id FROM password_resets pr WHERE pr.token = ? AND pr.expires_at > NOW() LIMIT 1'
    );
    $stmt->execute([$token]);
    $row = $stmt->fetch();
    if (!$row) json_error('Invalid or expired reset token', 400);

    $hash = password_hash($newPass, PASSWORD_BCRYPT, ['cost' => 12]);
    db()->prepare('UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?')
        ->execute([$hash, $row['user_id']]);
    db()->prepare('DELETE FROM password_resets WHERE user_id = ?')->execute([$row['user_id']]);

    audit_log($row['user_id'], 'password_reset', 'Password reset via token', 'auth');
    json_ok('Password reset — please log in');
}

/* ─────────────────────────────── ME ────────────────────────────────── */
function action_me(): never {
    require_method('GET');
    $u = auth_user();

    $stmt = db()->prepare(
        'SELECT u.id, u.email, u.employee_id, u.full_name, u.role, u.department, u.shift_start, u.shift_end,
                u.phone, u.address, u.is_active, u.face_enrolled, u.last_login,
                fd.last_verified as face_last_verified
         FROM users u
         LEFT JOIN face_descriptors fd ON fd.user_id = u.id
         WHERE u.id = ? LIMIT 1'
    );
    $stmt->execute([$u['user_id']]);
    $user = $stmt->fetch();
    if (!$user) json_error('User not found', 404);

    json_ok($user);
}
