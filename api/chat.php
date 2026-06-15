<?php
/**
 * StaffSync — chat.php
 * WhatsApp-style messaging: DMs, public group, team groups, status/stories
 * Actions: boot (auto-table creation on first call)
 *
 * Supported actions:
 *   GET  channel_list, message_list, unread_counts, status_list, search_users, dm_open
 *   POST message_send, message_delete, mark_read, channel_create, channel_leave,
 *        status_post, status_view, status_delete, react, remove_reaction
 */
require_once __DIR__ . '/config.php';

/* ── Allow multipart/form-data (file uploads) alongside JSON ── */
header('Content-Type: application/json; charset=UTF-8');

boot_chat_tables();

$action = $_GET['action'] ?? (json_decode(file_get_contents('php://input'), true)['action'] ?? '');

match ($action) {
    'channel_list'    => action_channel_list(),
    'channel_members' => action_channel_members(),
    'channel_create'  => action_channel_create(),
    'channel_leave'   => action_channel_leave(),
    'dm_open'         => action_dm_open(),
    'message_list'    => action_message_list(),
    'message_send'    => action_message_send(),
    'message_delete'  => action_message_delete(),
    'mark_read'       => action_mark_read(),
    'unread_counts'   => action_unread_counts(),
    'search_users'    => action_search_users(),
    'status_list'     => action_status_list(),
    'status_post'     => action_status_post(),
    'status_view'     => action_status_view(),
    'status_delete'   => action_status_delete(),
    'react'           => action_react(),
    'remove_reaction' => action_remove_reaction(),
    default           => json_error("Unknown action: $action"),
};

/* ═══════════════════════════════════════════════════════
   BOOT — auto-create all chat tables on first API call
═══════════════════════════════════════════════════════ */
function boot_chat_tables(): void {
    $pdo = db();

    $pdo->exec("CREATE TABLE IF NOT EXISTS chat_channels (
        id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name         VARCHAR(120) NOT NULL,
        type         ENUM('dm','public','team') NOT NULL,
        description  VARCHAR(255) NULL,
        avatar_url   VARCHAR(255) NULL,
        created_by   INT UNSIGNED NOT NULL,
        task_id      INT UNSIGNED NULL COMMENT 'if team channel tied to a task',
        is_archived  TINYINT(1)  NOT NULL DEFAULT 0,
        created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS chat_members (
        id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        channel_id   INT UNSIGNED NOT NULL,
        user_id      INT UNSIGNED NOT NULL,
        role         ENUM('member','admin') NOT NULL DEFAULT 'member',
        joined_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        muted        TINYINT(1) NOT NULL DEFAULT 0,
        UNIQUE KEY uq_chan_user (channel_id, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS chat_messages (
        id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        channel_id      INT UNSIGNED NOT NULL,
        sender_id       INT UNSIGNED NOT NULL,
        body            TEXT NULL,
        attachment_url  VARCHAR(512) NULL,
        attachment_type ENUM('image','video','doc','audio') NULL,
        attachment_name VARCHAR(255) NULL,
        reply_to_id     INT UNSIGNED NULL COMMENT 'quoted/replied message id',
        is_deleted      TINYINT(1) NOT NULL DEFAULT 0,
        created_at      DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_channel (channel_id),
        KEY idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS chat_reads (
        id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        channel_id           INT UNSIGNED NOT NULL,
        user_id              INT UNSIGNED NOT NULL,
        last_read_message_id INT UNSIGNED NULL,
        last_read_at         DATETIME NULL,
        UNIQUE KEY uq_chan_user (channel_id, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS chat_reactions (
        id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        message_id INT UNSIGNED NOT NULL,
        user_id    INT UNSIGNED NOT NULL,
        emoji      VARCHAR(10) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_msg_user_emoji (message_id, user_id, emoji)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS chat_statuses (
        id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id       INT UNSIGNED NOT NULL,
        caption       VARCHAR(255) NULL,
        media_url     VARCHAR(512) NOT NULL,
        media_type    ENUM('image','video') NOT NULL DEFAULT 'image',
        bg_color      VARCHAR(20) NULL COMMENT 'hex color for text-only status',
        expires_at    DATETIME NOT NULL,
        created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_user   (user_id),
        KEY idx_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS chat_status_views (
        id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        status_id  INT UNSIGNED NOT NULL,
        viewer_id  INT UNSIGNED NOT NULL,
        viewed_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_status_viewer (status_id, viewer_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    /* De-duplicate: keep only the lowest-id "Everyone" channel, delete extras */
    $dupes = $pdo->query("SELECT id FROM chat_channels WHERE type='public' AND name='Everyone' ORDER BY id ASC")->fetchAll();
    if (count($dupes) > 1) {
        $keep = (int)$dupes[0]['id'];
        foreach (array_slice($dupes, 1) as $d) {
            $del = (int)$d['id'];
            $pdo->exec("DELETE FROM chat_members  WHERE channel_id = $del");
            $pdo->exec("DELETE FROM chat_messages WHERE channel_id = $del");
            $pdo->exec("DELETE FROM chat_reads    WHERE channel_id = $del");
            $pdo->exec("DELETE FROM chat_channels WHERE id = $del");
        }
        $chanId = $keep;
        /* Ensure all active users are in the surviving channel */
        $users = $pdo->query("SELECT id FROM users WHERE is_active = 1")->fetchAll();
        $ins   = $pdo->prepare("INSERT IGNORE INTO chat_members (channel_id, user_id, role) VALUES (?, ?, 'member')");
        foreach ($users as $u) $ins->execute([$chanId, $u['id']]);
    } elseif (count($dupes) === 0) {
        /* Create fresh */
        $pdo->exec("INSERT INTO chat_channels (name, type, description, created_by)
                    VALUES ('Everyone', 'public', 'Company-wide announcements and chat', 1)");
        $chanId = $pdo->lastInsertId();
        $users = $pdo->query("SELECT id FROM users WHERE is_active = 1")->fetchAll();
        $ins   = $pdo->prepare("INSERT IGNORE INTO chat_members (channel_id, user_id, role) VALUES (?, ?, 'member')");
        foreach ($users as $u) $ins->execute([$chanId, $u['id']]);
    } else {
        /* Exactly one exists — make sure current user is a member */
        $chanId = (int)$dupes[0]['id'];
        $users = $pdo->query("SELECT id FROM users WHERE is_active = 1")->fetchAll();
        $ins   = $pdo->prepare("INSERT IGNORE INTO chat_members (channel_id, user_id, role) VALUES (?, ?, 'member')");
        foreach ($users as $u) $ins->execute([$chanId, $u['id']]);
    }
}

/* ═══════════════════════════════════════════════════════
   CHANNEL LIST — returns channels the user belongs to
   with last message + unread count per channel
═══════════════════════════════════════════════════════ */
function action_channel_list(): never {
    $u = auth_user();
    $uid = $u['user_id'];

    $stmt = db()->prepare("
        SELECT
            c.id, c.name, c.type, c.description, c.avatar_url, c.is_archived, c.created_by, c.task_id,
            cm.role  AS my_role,
            cm.muted AS muted,
            /* last message */
            lm.id              AS last_msg_id,
            lm.body            AS last_msg_body,
            lm.sender_id       AS last_msg_sender_id,
            lm.created_at      AS last_msg_at,
            lm.attachment_type AS last_msg_attach_type,
            su.full_name       AS last_msg_sender_name,
            /* unread count */
            (SELECT COUNT(*) FROM chat_messages m2
             WHERE m2.channel_id = c.id
               AND m2.is_deleted = 0
               AND m2.id > COALESCE(cr.last_read_message_id, 0)
               AND m2.sender_id <> ?
            ) AS unread_count,
            /* member count */
            (SELECT COUNT(*) FROM chat_members mem WHERE mem.channel_id = c.id) AS member_count,
            /* DM peer — safe subquery so no extra rows on group channels */
            (SELECT u2.full_name FROM chat_members cm2
             JOIN users u2 ON u2.id = cm2.user_id
             WHERE cm2.channel_id = c.id AND cm2.user_id <> ? AND c.type = 'dm'
             LIMIT 1) AS dm_peer_name,
            (SELECT cm3.user_id FROM chat_members cm3
             WHERE cm3.channel_id = c.id AND cm3.user_id <> ? AND c.type = 'dm'
             LIMIT 1) AS dm_peer_id,
            (SELECT u3.department FROM chat_members cm4
             JOIN users u3 ON u3.id = cm4.user_id
             WHERE cm4.channel_id = c.id AND cm4.user_id <> ? AND c.type = 'dm'
             LIMIT 1) AS dm_peer_dept
        FROM chat_channels c
        JOIN chat_members cm ON cm.channel_id = c.id AND cm.user_id = ?
        LEFT JOIN chat_messages lm ON lm.id = (
            SELECT MAX(id) FROM chat_messages WHERE channel_id = c.id AND is_deleted = 0
        )
        LEFT JOIN users su ON su.id = lm.sender_id
        LEFT JOIN chat_reads cr ON cr.channel_id = c.id AND cr.user_id = ?
        WHERE c.is_archived = 0
        GROUP BY c.id
        ORDER BY COALESCE(lm.created_at, c.created_at) DESC
    ");
    $stmt->execute([$uid, $uid, $uid, $uid, $uid, $uid]);
    json_ok($stmt->fetchAll());
}

/* ═══════════════════════════════════════════════════════
   OPEN / CREATE DM  — finds or creates a DM channel
═══════════════════════════════════════════════════════ */
function action_dm_open(): never {
    require_method('POST');
    $u    = auth_user();
    $b    = body();
    $peer = i($b['peer_user_id'] ?? 0);
    if (!$peer) json_error('peer_user_id required');

    $uid = $u['user_id'];

    /* Check if DM already exists */
    $stmt = db()->prepare("
        SELECT c.id FROM chat_channels c
        JOIN chat_members m1 ON m1.channel_id = c.id AND m1.user_id = ?
        JOIN chat_members m2 ON m2.channel_id = c.id AND m2.user_id = ?
        WHERE c.type = 'dm'
        LIMIT 1
    ");
    $stmt->execute([$uid, $peer]);
    $existing = $stmt->fetch();
    if ($existing) json_ok(['channel_id' => (int)$existing['id']]);

    /* Create */
    $peerRow = db()->prepare("SELECT full_name FROM users WHERE id = ? LIMIT 1");
    $peerRow->execute([$peer]);
    $peerData = $peerRow->fetch();
    if (!$peerData) json_error('User not found', 404);

    $me = db()->prepare("SELECT full_name FROM users WHERE id = ? LIMIT 1");
    $me->execute([$uid]);
    $myData = $me->fetch();

    $name = $myData['full_name'] . ' & ' . $peerData['full_name'];
    db()->prepare("INSERT INTO chat_channels (name, type, created_by) VALUES (?, 'dm', ?)")
        ->execute([$name, $uid]);
    $chanId = (int)db()->lastInsertId();

    $ins = db()->prepare("INSERT IGNORE INTO chat_members (channel_id, user_id, role) VALUES (?, ?, 'member')");
    $ins->execute([$chanId, $uid]);
    $ins->execute([$chanId, $peer]);

    json_ok(['channel_id' => $chanId, 'created' => true]);
}

/* ═══════════════════════════════════════════════════════
   CHANNEL CREATE — team or additional public channels
═══════════════════════════════════════════════════════ */
function action_channel_create(): never {
    require_method('POST');
    $u    = auth_user(['MANAGER', 'HR', 'IT_ADMIN', 'FINANCE']);
    $b    = body();

    $name    = trim($b['name'] ?? '');
    $type    = $b['type'] ?? 'team';      // team | public
    $desc    = trim($b['description'] ?? '');
    $members = $b['member_ids'] ?? [];    // array of user IDs
    $taskId  = isset($b['task_id']) ? i($b['task_id']) : null;

    if (!$name) json_error('Channel name required');
    if (!in_array($type, ['team', 'public'])) json_error('Invalid type');

    $uid = $u['user_id'];
    db()->prepare("INSERT INTO chat_channels (name, type, description, created_by, task_id)
                   VALUES (?, ?, ?, ?, ?)")
        ->execute([$name, $type, $desc ?: null, $uid, $taskId]);
    $chanId = (int)db()->lastInsertId();

    /* Creator is always admin */
    db()->prepare("INSERT IGNORE INTO chat_members (channel_id, user_id, role) VALUES (?, ?, 'admin')")
        ->execute([$chanId, $uid]);

    /* Add invited members */
    $ins = db()->prepare("INSERT IGNORE INTO chat_members (channel_id, user_id, role) VALUES (?, ?, 'member')");
    foreach ($members as $mid) {
        if ((int)$mid !== $uid) $ins->execute([$chanId, (int)$mid]);
    }

    /* If public — join everyone */
    if ($type === 'public') {
        $users = db()->query("SELECT id FROM users WHERE is_active = 1")->fetchAll();
        foreach ($users as $usr) {
            if ($usr['id'] != $uid) $ins->execute([$chanId, $usr['id']]);
        }
    }

    audit_log($uid, 'chat_channel_created', "Channel '$name' ($type) created", 'chat');
    json_ok(['channel_id' => $chanId]);
}

/* ═══════════════════════════════════════════════════════
   CHANNEL LEAVE
═══════════════════════════════════════════════════════ */
function action_channel_leave(): never {
    require_method('POST');
    $u  = auth_user();
    $b  = body();
    $id = i($b['channel_id'] ?? 0);

    $ch = db()->prepare("SELECT type FROM chat_channels WHERE id = ? LIMIT 1");
    $ch->execute([$id]);
    $chan = $ch->fetch();
    if (!$chan) json_error('Channel not found', 404);
    if ($chan['type'] === 'dm') json_error('Cannot leave a DM');

    db()->prepare("DELETE FROM chat_members WHERE channel_id = ? AND user_id = ?")
        ->execute([$id, $u['user_id']]);
    json_ok('Left channel');
}

/* ═══════════════════════════════════════════════════════
   MESSAGE LIST — paginated, newest last
═══════════════════════════════════════════════════════ */
function action_message_list(): never {
    require_method('GET');
    $u    = auth_user();
    $uid  = $u['user_id'];
    $chan = i($_GET['channel_id'] ?? 0);
    if (!$chan) json_error('channel_id required');

    /* Must be a member */
    $chk = db()->prepare("SELECT 1 FROM chat_members WHERE channel_id = ? AND user_id = ?");
    $chk->execute([$chan, $uid]);
    if (!$chk->fetch()) json_error('Not a member of this channel', 403);

    $before = i($_GET['before_id'] ?? 0);   // for pagination (load older)
    $limit  = min(i($_GET['limit'] ?? 50), 100);

    $sql  = "SELECT
                m.id, m.channel_id, m.sender_id, m.body,
                m.attachment_url, m.attachment_type, m.attachment_name,
                m.reply_to_id, m.is_deleted, m.created_at,
                u.full_name AS sender_name, u.department AS sender_dept,
                qm.body            AS reply_body,
                qm.sender_id       AS reply_sender_id,
                qu.full_name       AS reply_sender_name,
                qm.attachment_type AS reply_attach_type
             FROM chat_messages m
             JOIN users u ON u.id = m.sender_id
             LEFT JOIN chat_messages qm ON qm.id = m.reply_to_id
             LEFT JOIN users qu ON qu.id = qm.sender_id
             WHERE m.channel_id = ?";
    $params = [$chan];

    if ($before) { $sql .= " AND m.id < ?"; $params[] = $before; }
    $sql .= " ORDER BY m.id DESC LIMIT $limit";

    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $rows = array_reverse($stmt->fetchAll());   // chronological order

    if (empty($rows)) { json_ok([]); }

    /* Fetch reactions separately (MariaDB 10.4 has no JSON_ARRAYAGG) */
    $ids       = implode(',', array_map(fn($r) => (int)$r['id'], $rows));
    $rxnStmt   = db()->query("
        SELECT r.message_id, r.emoji, r.user_id, u.full_name AS user_name
        FROM   chat_reactions r
        JOIN   users u ON u.id = r.user_id
        WHERE  r.message_id IN ($ids)
    ");
    $rxnRows = $rxnStmt ? $rxnStmt->fetchAll() : [];

    /* group by message_id */
    $rxnMap = [];
    foreach ($rxnRows as $rxn) {
        $rxnMap[(int)$rxn['message_id']][] = [
            'emoji'     => $rxn['emoji'],
            'user_id'   => (int)$rxn['user_id'],
            'user_name' => $rxn['user_name'],
        ];
    }

    foreach ($rows as &$row) {
        $row['reactions'] = $rxnMap[(int)$row['id']] ?? [];
    }
    unset($row);

    json_ok($rows);
}

/* ═══════════════════════════════════════════════════════
   MESSAGE SEND — text, reply-to, or file attachment
═══════════════════════════════════════════════════════ */
function action_message_send(): never {
    $u    = auth_user();
    $uid  = $u['user_id'];

    /* Support both JSON body and multipart (file upload) */
    $isMultipart = str_contains($_SERVER['CONTENT_TYPE'] ?? '', 'multipart');

    if ($isMultipart) {
        $chan      = i($_POST['channel_id'] ?? 0);
        $body_text = trim($_POST['body'] ?? '');
        $replyTo   = isset($_POST['reply_to_id']) ? i($_POST['reply_to_id']) : null;
    } else {
        $b         = body();
        $chan      = i($b['channel_id'] ?? 0);
        $body_text = trim($b['body'] ?? '');
        $replyTo   = isset($b['reply_to_id']) ? i($b['reply_to_id']) : null;
    }

    if (!$chan) json_error('channel_id required');

    /* Must be a member */
    $chk = db()->prepare("SELECT 1 FROM chat_members WHERE channel_id = ? AND user_id = ?");
    $chk->execute([$chan, $uid]);
    if (!$chk->fetch()) json_error('Not a member of this channel', 403);

    if (!$body_text && empty($_FILES['file']['tmp_name'])) {
        json_error('Message body or file required');
    }

    /* Handle file upload */
    $attachUrl  = null;
    $attachType = null;
    $attachName = null;

    if (!empty($_FILES['file']['tmp_name'])) {
        $file     = $_FILES['file'];
        $origName = basename($file['name']);
        $mime     = mime_content_type($file['tmp_name']);
        $ext      = strtolower(pathinfo($origName, PATHINFO_EXTENSION));

        $allowed = [
            'image'  => ['jpg','jpeg','png','gif','webp','svg'],
            'video'  => ['mp4','webm','mov','avi'],
            'doc'    => ['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','csv','zip'],
            'audio'  => ['mp3','wav','ogg','m4a'],
        ];

        $attachType = null;
        foreach ($allowed as $type => $exts) {
            if (in_array($ext, $exts)) { $attachType = $type; break; }
        }
        if (!$attachType) json_error('File type not allowed');

        $maxBytes = 50 * 1024 * 1024; // 50 MB for video, else 20 MB
        $maxBytes = ($attachType === 'video') ? 50 * 1024 * 1024 : 20 * 1024 * 1024;
        if ($file['size'] > $maxBytes) json_error('File too large (max ' . ($maxBytes / 1048576) . ' MB)');

        $dir = UPLOAD_DIR . 'chat/';
        if (!is_dir($dir)) mkdir($dir, 0755, true);

        $filename = uniqid('chat_', true) . '.' . $ext;
        move_uploaded_file($file['tmp_name'], $dir . $filename);

        $attachUrl  = APP_URL . '/uploads/chat/' . $filename;
        $attachName = $origName;
    }

    $stmt = db()->prepare("INSERT INTO chat_messages
        (channel_id, sender_id, body, attachment_url, attachment_type, attachment_name, reply_to_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([$chan, $uid, $body_text ?: null, $attachUrl, $attachType, $attachName, $replyTo]);
    $msgId = (int)db()->lastInsertId();

    /* Fetch the full row to return to client */
    $fetch = db()->prepare("
        SELECT m.*, u.full_name AS sender_name, u.department AS sender_dept,
               qm.body AS reply_body, qu.full_name AS reply_sender_name,
               qm.attachment_type AS reply_attach_type
        FROM chat_messages m
        JOIN users u ON u.id = m.sender_id
        LEFT JOIN chat_messages qm ON qm.id = m.reply_to_id
        LEFT JOIN users qu ON qu.id = qm.sender_id
        WHERE m.id = ? LIMIT 1
    ");
    $fetch->execute([$msgId]);
    $msg = $fetch->fetch();
    $msg['reactions'] = [];

    json_ok($msg);
}

/* ═══════════════════════════════════════════════════════
   MESSAGE DELETE (soft)
═══════════════════════════════════════════════════════ */
function action_message_delete(): never {
    require_method('POST');
    $u   = auth_user();
    $b   = body();
    $mid = i($b['message_id'] ?? 0);

    $stmt = db()->prepare("SELECT sender_id, channel_id FROM chat_messages WHERE id = ? LIMIT 1");
    $stmt->execute([$mid]);
    $msg = $stmt->fetch();
    if (!$msg) json_error('Message not found', 404);

    /* Sender or channel admin can delete */
    if ((int)$msg['sender_id'] !== $u['user_id']) {
        $admin = db()->prepare("SELECT role FROM chat_members WHERE channel_id = ? AND user_id = ? LIMIT 1");
        $admin->execute([$msg['channel_id'], $u['user_id']]);
        $r = $admin->fetch();
        if (!$r || $r['role'] !== 'admin') json_error('Cannot delete this message', 403);
    }

    db()->prepare("UPDATE chat_messages SET is_deleted = 1 WHERE id = ?")->execute([$mid]);
    json_ok('Deleted');
}

/* ═══════════════════════════════════════════════════════
   MARK READ
═══════════════════════════════════════════════════════ */
function action_mark_read(): never {
    require_method('POST');
    $u   = auth_user();
    $b   = body();
    $chan = i($b['channel_id'] ?? 0);
    $mid  = i($b['last_message_id'] ?? 0);

    db()->prepare("INSERT INTO chat_reads (channel_id, user_id, last_read_message_id, last_read_at)
                   VALUES (?, ?, ?, NOW())
                   ON DUPLICATE KEY UPDATE last_read_message_id = ?, last_read_at = NOW()")
        ->execute([$chan, $u['user_id'], $mid, $mid]);
    json_ok('ok');
}

/* ═══════════════════════════════════════════════════════
   UNREAD COUNTS — { channel_id: count, ... }
═══════════════════════════════════════════════════════ */
function action_unread_counts(): never {
    require_method('GET');
    $u   = auth_user();
    $uid = $u['user_id'];

    $stmt = db()->prepare("
        SELECT cm.channel_id,
               COUNT(m.id) AS unread
        FROM chat_members cm
        JOIN chat_messages m ON m.channel_id = cm.channel_id
            AND m.sender_id <> ?
            AND m.is_deleted = 0
            AND m.id > COALESCE(
                (SELECT cr.last_read_message_id FROM chat_reads cr
                 WHERE cr.channel_id = cm.channel_id AND cr.user_id = ? LIMIT 1), 0)
        WHERE cm.user_id = ?
        GROUP BY cm.channel_id
    ");
    $stmt->execute([$uid, $uid, $uid]);
    $rows = $stmt->fetchAll();
    $out  = [];
    foreach ($rows as $r) $out[(int)$r['channel_id']] = (int)$r['unread'];
    json_ok($out);
}

/* ═══════════════════════════════════════════════════════
   SEARCH USERS — for starting DMs
═══════════════════════════════════════════════════════ */
function action_search_users(): never {
    require_method('GET');
    $u   = auth_user();
    $q   = trim($_GET['q'] ?? '');
    if (strlen($q) < 1) json_ok([]);

    $stmt = db()->prepare("
        SELECT id, full_name, department, role FROM users
        WHERE is_active = 1
          AND id <> ?
          AND (full_name LIKE ? OR email LIKE ? OR department LIKE ?)
        ORDER BY full_name LIMIT 20
    ");
    $like = "%$q%";
    $stmt->execute([$u['user_id'], $like, $like, $like]);
    json_ok($stmt->fetchAll());
}

/* ═══════════════════════════════════════════════════════
   CHANNEL MEMBERS — for @mention dropdown
═══════════════════════════════════════════════════════ */
function action_channel_members(): never {
    require_method('GET');
    $u      = auth_user();
    $uid    = (int)$u['user_id'];
    $chanId = (int)($_GET['channel_id'] ?? 0);
    if (!$chanId) json_error('channel_id required', 400);

    $pdo  = db();

    /* verify caller is a member of this channel */
    $check = $pdo->prepare("SELECT id FROM chat_members WHERE channel_id=? AND user_id=?");
    $check->execute([$chanId, $uid]);
    if (!$check->fetch()) json_error('Not a member', 403);

    $stmt = $pdo->prepare("
        SELECT u.id, u.full_name, u.department, u.role
        FROM   chat_members cm
        JOIN   users u ON u.id = cm.user_id
        WHERE  cm.channel_id = ?
          AND  u.is_active = 1
          AND  u.id <> ?
        ORDER BY u.full_name
    ");
    $stmt->execute([$chanId, $uid]);
    json_ok($stmt->fetchAll());
}

/* ═══════════════════════════════════════════════════════
   STATUS (STORIES) LIST — grouped by user, last 24 h
═══════════════════════════════════════════════════════ */
function action_status_list(): never {
    require_method('GET');
    $u   = auth_user();
    $uid = $u['user_id'];

    /* All statuses in last 24 h, own ones first */
    $stmt = db()->prepare("
        SELECT s.id, s.user_id, s.caption, s.media_url, s.media_type, s.bg_color,
               s.expires_at, s.created_at,
               u.full_name AS user_name, u.department,
               (s.user_id = ?) AS is_own,
               EXISTS(SELECT 1 FROM chat_status_views sv WHERE sv.status_id = s.id AND sv.viewer_id = ?) AS viewed,
               (SELECT COUNT(*) FROM chat_status_views sv2 WHERE sv2.status_id = s.id) AS view_count
        FROM chat_statuses s
        JOIN users u ON u.id = s.user_id
        WHERE s.expires_at > NOW()
        ORDER BY (s.user_id = ?) DESC, s.created_at DESC
    ");
    $stmt->execute([$uid, $uid, $uid]);
    json_ok($stmt->fetchAll());
}

/* ═══════════════════════════════════════════════════════
   STATUS POST — upload image/video as 24-h story
═══════════════════════════════════════════════════════ */
function action_status_post(): never {
    $u   = auth_user();
    $uid = $u['user_id'];

    $caption  = trim($_POST['caption'] ?? '');
    $bgColor  = trim($_POST['bg_color'] ?? '');

    $mediaUrl  = null;
    $mediaType = 'image';

    if (!empty($_FILES['media']['tmp_name'])) {
        $file = $_FILES['media'];
        $ext  = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        $type = in_array($ext, ['mp4','webm','mov']) ? 'video' : 'image';

        $allowed = ['jpg','jpeg','png','gif','webp','mp4','webm','mov'];
        if (!in_array($ext, $allowed)) json_error('Only images/videos allowed for status');
        if ($file['size'] > 30 * 1024 * 1024) json_error('Max 30 MB for status');

        $dir = UPLOAD_DIR . 'status/';
        if (!is_dir($dir)) mkdir($dir, 0755, true);
        $filename = uniqid('status_', true) . '.' . $ext;
        move_uploaded_file($file['tmp_name'], $dir . $filename);

        $mediaUrl  = APP_URL . '/uploads/status/' . $filename;
        $mediaType = $type;
    } elseif ($bgColor) {
        /* Text-only status with color background — store a placeholder URL */
        $mediaUrl = '';
    } else {
        json_error('Media file required');
    }

    $expires = date('Y-m-d H:i:s', strtotime('+24 hours'));
    db()->prepare("INSERT INTO chat_statuses (user_id, caption, media_url, media_type, bg_color, expires_at)
                   VALUES (?, ?, ?, ?, ?, ?)")
        ->execute([$uid, $caption ?: null, $mediaUrl, $mediaType, $bgColor ?: null, $expires]);

    json_ok(['id' => (int)db()->lastInsertId()]);
}

/* ═══════════════════════════════════════════════════════
   STATUS VIEW — record a view
═══════════════════════════════════════════════════════ */
function action_status_view(): never {
    require_method('POST');
    $u   = auth_user();
    $b   = body();
    $sid = i($b['status_id'] ?? 0);

    db()->prepare("INSERT IGNORE INTO chat_status_views (status_id, viewer_id) VALUES (?, ?)")
        ->execute([$sid, $u['user_id']]);
    json_ok('ok');
}

/* ═══════════════════════════════════════════════════════
   STATUS DELETE
═══════════════════════════════════════════════════════ */
function action_status_delete(): never {
    require_method('POST');
    $u   = auth_user();
    $b   = body();
    $sid = i($b['status_id'] ?? 0);

    $stmt = db()->prepare("SELECT user_id FROM chat_statuses WHERE id = ? LIMIT 1");
    $stmt->execute([$sid]);
    $row = $stmt->fetch();
    if (!$row || (int)$row['user_id'] !== $u['user_id']) json_error('Not your status', 403);

    db()->prepare("DELETE FROM chat_statuses WHERE id = ?")->execute([$sid]);
    json_ok('Deleted');
}

/* ═══════════════════════════════════════════════════════
   REACT — add emoji reaction to a message
═══════════════════════════════════════════════════════ */
function action_react(): never {
    require_method('POST');
    $u   = auth_user();
    $b   = body();
    $mid = i($b['message_id'] ?? 0);
    $emoji = trim($b['emoji'] ?? '');
    if (!$mid || !$emoji) json_error('message_id and emoji required');

    db()->prepare("INSERT IGNORE INTO chat_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)")
        ->execute([$mid, $u['user_id'], $emoji]);
    json_ok('ok');
}

/* ═══════════════════════════════════════════════════════
   REMOVE REACTION
═══════════════════════════════════════════════════════ */
function action_remove_reaction(): never {
    require_method('POST');
    $u   = auth_user();
    $b   = body();
    $mid = i($b['message_id'] ?? 0);
    $emoji = trim($b['emoji'] ?? '');

    db()->prepare("DELETE FROM chat_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?")
        ->execute([$mid, $u['user_id'], $emoji]);
    json_ok('ok');
}
