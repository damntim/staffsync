<?php
/**
 * StaffSync — notifications.php
 * Actions: list | mark_read | send | unread_count
 */
require_once __DIR__ . '/config.php';

$action = $_GET['action'] ?? body()['action'] ?? '';

match($action) {
    'list'         => action_list(),
    'mark_read'    => action_mark_read(),
    'send'         => action_send(),
    'unread_count' => action_unread_count(),
    default        => json_error("Unknown action: $action"),
};

/* ─────────────────── LIST ─────────────────── */
function action_list(): never {
    require_method('GET');
    $u     = auth_user();
    $limit = min(i($_GET['limit'] ?? 30), 100);

    $stmt = db()->prepare(
        'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
    );
    $stmt->execute([$u['user_id'], $limit]);
    json_ok($stmt->fetchAll());
}

/* ─────────────────── MARK READ ─────────────────── */
function action_mark_read(): never {
    require_method('POST');
    $u  = auth_user();
    $b  = body();
    $id = i($b['notification_id'] ?? 0);

    if ($id) {
        db()->prepare('UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ? AND user_id = ?')
            ->execute([$id, $u['user_id']]);
    } else {
        db()->prepare('UPDATE notifications SET is_read = 1, read_at = NOW() WHERE user_id = ?')
            ->execute([$u['user_id']]);
    }
    json_ok('Marked read');
}

/* ─────────────────── SEND (internal, called by other modules) ─────────── */
function action_send(): never {
    require_method('POST');
    $u = auth_user(['HR','IT_ADMIN','MANAGER']);
    $b = body();

    $targetId = i($b['user_id'] ?? 0);
    $type     = $b['type'] ?? 'info';
    $title    = trim($b['title'] ?? '');
    $message  = trim($b['message'] ?? '');
    $sendEmail = (bool)($b['send_email'] ?? false);

    if (!$targetId || !$title || !$message) json_error('user_id, title, message required');

    notify_user($targetId, $type, $title, $message, $sendEmail);
    json_ok('Notification sent');
}

/* ─────────────────── UNREAD COUNT ─────────────────── */
function action_unread_count(): never {
    require_method('GET');
    $u = auth_user();

    $cnt = db()->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0');
    $cnt->execute([$u['user_id']]);
    json_ok(['count' => (int)$cnt->fetchColumn()]);
}

/* ─────────────────── HELPER: notify_user ─────────────────── */
function notify_user(int $userId, string $type, string $title, string $message, bool $email = false): void {
    try {
        db()->prepare(
            'INSERT INTO notifications (user_id, type, title, message, is_read, created_at) VALUES (?, ?, ?, ?, 0, NOW())'
        )->execute([$userId, $type, $title, $message]);

        if ($email) {
            $stmt = db()->prepare('SELECT email, full_name FROM users WHERE id = ? LIMIT 1');
            $stmt->execute([$userId]);
            $user = $stmt->fetch();
            if ($user) {
                $body = "Hi {$user['full_name']},\n\n$message\n\n— StaffSync";
                @mail($user['email'], "StaffSync — $title", $body, 'From: noreply@devx.com');
            }
        }
    } catch (Throwable) { /* never crash callers */ }
}
