<?php
/**
 * StaffSync — tasks.php
 * Actions: list | get | create | update | delete | assign | subtask_update | comment_add | comment_list
 */
require_once __DIR__ . '/config.php';

$action = $_GET['action'] ?? body()['action'] ?? '';

match($action) {
    'list'            => action_list(),
    'get'             => action_get(),
    'create'          => action_create(),
    'update'          => action_update(),
    'delete'          => action_delete(),
    'assign'          => action_assign(),
    'subtask_update'  => action_subtask_update(),
    'progress_update' => action_progress_update(),
    'comment_add'     => action_comment_add(),
    'comment_list'    => action_comment_list(),
    default           => json_error("Unknown action: $action"),
};

/* ─────────────────── LIST ─────────────────── */
function action_list(): never {
    require_method('GET');
    $u = auth_user();

    $status   = $_GET['status']   ?? null;
    $priority = $_GET['priority'] ?? null;
    $assignee = i($_GET['assignee_id'] ?? 0);
    $teamId   = i($_GET['team_id'] ?? 0);

    $isManager = in_array($u['role'], ['MANAGER','HR','IT_ADMIN']);

    $sql    = 'SELECT t.*, u.full_name as assignee_name, c.full_name as creator_name
               FROM tasks t
               JOIN users u ON u.id = t.assignee_id
               JOIN users c ON c.id = t.created_by
               WHERE 1=1';
    $params = [];

    if (!$isManager) { $sql .= ' AND t.assignee_id = ?'; $params[] = $u['user_id']; }
    elseif ($assignee) { $sql .= ' AND t.assignee_id = ?'; $params[] = $assignee; }

    if ($teamId)   { $sql .= ' AND t.team_id = ?';   $params[] = $teamId; }
    if ($status)   { $sql .= ' AND t.status = ?';    $params[] = strtoupper($status); }
    if ($priority) { $sql .= ' AND t.priority = ?';  $params[] = strtoupper($priority); }

    $sql .= ' ORDER BY t.due_date ASC, t.priority DESC LIMIT 200';

    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $tasks = $stmt->fetchAll();

    // Attach subtasks + progress
    foreach ($tasks as &$task) {
        $sub = db()->prepare('SELECT id, label, is_done, sort_order FROM subtasks WHERE task_id = ? ORDER BY sort_order');
        $sub->execute([$task['id']]);
        $task['steps'] = $sub->fetchAll();
        $task['subtask_total'] = count($task['steps']);
        $task['subtask_done']  = count(array_filter($task['steps'], fn($s) => $s['is_done']));
        if ($task['subtask_total'] > 0) {
            $task['progress'] = round(($task['subtask_done'] / $task['subtask_total']) * 100);
        } else {
            $task['progress'] = (int)($task['progress_pct'] ?? 0);
        }
    }

    json_ok($tasks);
}

/* ─────────────────── GET ONE ─────────────────── */
function action_get(): never {
    require_method('GET');
    $u  = auth_user();
    $id = i($_GET['id'] ?? 0);
    if (!$id) json_error('id required');

    $stmt = db()->prepare('SELECT t.*, u.full_name as assignee_name FROM tasks t JOIN users u ON u.id = t.assignee_id WHERE t.id = ? LIMIT 1');
    $stmt->execute([$id]);
    $task = $stmt->fetch();
    if (!$task) json_error('Task not found', 404);

    // Subtasks
    $sub = db()->prepare('SELECT * FROM subtasks WHERE task_id = ? ORDER BY sort_order');
    $sub->execute([$id]);
    $task['subtasks'] = $sub->fetchAll();

    // Comments
    $com = db()->prepare(
        'SELECT tc.*, u.full_name, u.employee_id FROM task_comments tc JOIN users u ON u.id = tc.user_id WHERE tc.task_id = ? ORDER BY tc.created_at ASC'
    );
    $com->execute([$id]);
    $task['comments'] = $com->fetchAll();

    json_ok($task);
}

/* ─────────────────── CREATE ─────────────────── */
function action_create(): never {
    require_method('POST');
    $u = auth_user(['MANAGER','HR','IT_ADMIN']);
    $b = body();

    $title    = trim($b['title'] ?? '');
    $assignee = i($b['assignee_id'] ?? 0);
    if (!$title || !$assignee) json_error('title and assignee_id required');

    $priority = strtoupper($b['priority'] ?? 'MEDIUM');
    $status   = 'TODO';
    $dueDate  = $b['due_date'] ?? null;
    $desc     = trim($b['description'] ?? '');
    $tags     = json_encode($b['tags'] ?? []);
    $teamId   = i($b['team_id'] ?? 0) ?: null;

    $stmt = db()->prepare(
        'INSERT INTO tasks (title, description, priority, status, assignee_id, created_by, due_date, tags, team_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())'
    );
    $stmt->execute([$title, $desc, $priority, $status, $assignee, $u['user_id'], $dueDate, $tags, $teamId]);
    $taskId = (int)db()->lastInsertId();

    // Subtasks
    foreach ($b['subtasks'] ?? [] as $i => $sub) {
        db()->prepare('INSERT INTO subtasks (task_id, label, sort_order, created_at) VALUES (?, ?, ?, NOW())')
            ->execute([$taskId, trim($sub['label'] ?? $sub), $i]);
    }

    audit_log($u['user_id'], 'task_create', "Task '$title' created → user $assignee", 'tasks');
    json_ok(['task_id' => $taskId], 201);
}

/* ─────────────────── UPDATE ─────────────────── */
function action_update(): never {
    require_method('POST');
    $u  = auth_user();
    $b  = body();
    $id = i($b['task_id'] ?? 0);
    if (!$id) json_error('task_id required');

    // Employees can only update status on their own tasks
    $isManager = in_array($u['role'], ['MANAGER','HR','IT_ADMIN']);

    $allowed = $isManager
        ? ['title','description','priority','status','due_date','assignee_id']
        : ['status'];

    $sets   = [];
    $params = [];
    foreach ($allowed as $col) {
        if (array_key_exists($col, $b)) {
            $sets[]   = "$col = ?";
            $params[] = is_string($b[$col]) ? strtoupper($b[$col]) : $b[$col];
        }
    }
    if (!$sets) json_error('Nothing to update');

    $params[] = $id;
    db()->prepare('UPDATE tasks SET ' . implode(', ', $sets) . ', updated_at = NOW() WHERE id = ?')->execute($params);

    audit_log($u['user_id'], 'task_update', "Task $id updated", 'tasks');
    json_ok('Task updated');
}

/* ─────────────────── DELETE ─────────────────── */
function action_delete(): never {
    require_method('POST');
    $u  = auth_user(['MANAGER','HR','IT_ADMIN']);
    $b  = body();
    $id = i($b['task_id'] ?? 0);

    db()->prepare('DELETE FROM subtasks WHERE task_id = ?')->execute([$id]);
    db()->prepare('DELETE FROM task_comments WHERE task_id = ?')->execute([$id]);
    db()->prepare('DELETE FROM tasks WHERE id = ?')->execute([$id]);

    audit_log($u['user_id'], 'task_delete', "Task $id deleted", 'tasks');
    json_ok('Task deleted');
}

/* ─────────────────── ASSIGN ─────────────────── */
function action_assign(): never {
    require_method('POST');
    $u  = auth_user(['MANAGER','HR','IT_ADMIN']);
    $b  = body();
    $id         = i($b['task_id'] ?? 0);
    $assigneeId = i($b['assignee_id'] ?? 0);
    if (!$id || !$assigneeId) json_error('task_id and assignee_id required');

    db()->prepare('UPDATE tasks SET assignee_id = ?, updated_at = NOW() WHERE id = ?')->execute([$assigneeId, $id]);
    audit_log($u['user_id'], 'task_assign', "Task $id assigned to user $assigneeId", 'tasks');
    json_ok('Assigned');
}

/* ─────────────────── SUBTASK UPDATE ─────────────────── */
function action_subtask_update(): never {
    require_method('POST');
    $u  = auth_user();
    $b  = body();
    $id = i($b['subtask_id'] ?? 0);
    if (!$id) json_error('subtask_id required');

    $done = isset($b['is_done']) ? (int)(bool)$b['is_done'] : null;
    if ($done === null) json_error('is_done required');

    db()->prepare('UPDATE subtasks SET is_done = ?, updated_at = NOW() WHERE id = ?')->execute([$done, $id]);

    // Recalculate task progress
    $taskRow = db()->prepare('SELECT task_id FROM subtasks WHERE id = ?');
    $taskRow->execute([$id]);
    $taskId  = $taskRow->fetchColumn();

    $counts = db()->prepare('SELECT COUNT(*) as total, SUM(is_done) as done FROM subtasks WHERE task_id = ?');
    $counts->execute([$taskId]);
    $c = $counts->fetch();
    $pct = $c['total'] > 0 ? round(($c['done'] / $c['total']) * 100) : 0;

    // Auto-complete task if all subtasks done
    if ($pct === 100) {
        db()->prepare("UPDATE tasks SET status = 'DONE', updated_at = NOW() WHERE id = ?")->execute([$taskId]);
    } elseif ($pct > 0) {
        db()->prepare("UPDATE tasks SET status = 'IN_PROGRESS', updated_at = NOW() WHERE id = ? AND status = 'TODO'")->execute([$taskId]);
    }

    json_ok(['progress' => $pct]);
}

/* ─────────────────── PROGRESS UPDATE (employee self-reports %) ─────────────────── */
function action_progress_update(): never {
    require_method('POST');
    $u  = auth_user();
    $b  = body();
    $id  = i($b['task_id'] ?? 0);
    $pct = max(0, min(100, (int)($b['progress_pct'] ?? 0)));
    if (!$id) json_error('task_id required');

    // Only assignee or manager/HR can update progress
    $stmt = db()->prepare('SELECT assignee_id, status FROM tasks WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $task = $stmt->fetch();
    if (!$task) json_error('Task not found', 404);

    $isManager = in_array($u['role'], ['MANAGER','HR','IT_ADMIN']);
    if (!$isManager && $task['assignee_id'] != $u['user_id']) json_error('Not your task', 403);

    $newStatus = $task['status'];
    if ($pct === 100) $newStatus = 'DONE';
    elseif ($pct > 0 && $task['status'] === 'TODO') $newStatus = 'IN_PROGRESS';

    db()->prepare('UPDATE tasks SET progress_pct = ?, status = ?, updated_at = NOW() WHERE id = ?')
        ->execute([$pct, $newStatus, $id]);

    audit_log($u['user_id'], 'task_progress', "Task $id progress set to {$pct}%", 'tasks');
    json_ok(['progress_pct' => $pct, 'status' => $newStatus]);
}

/* ─────────────────── COMMENT ADD ─────────────────── */
function action_comment_add(): never {
    require_method('POST');
    $u  = auth_user();
    $b  = body();
    $taskId = i($b['task_id'] ?? 0);
    $text   = trim($b['text'] ?? '');
    if (!$taskId || !$text) json_error('task_id and text required');

    db()->prepare('INSERT INTO task_comments (task_id, user_id, text, created_at) VALUES (?, ?, ?, NOW())')
        ->execute([$taskId, $u['user_id'], $text]);
    $cid = db()->lastInsertId();

    json_ok(['comment_id' => $cid], 201);
}

/* ─────────────────── COMMENT LIST ─────────────────── */
function action_comment_list(): never {
    require_method('GET');
    $u      = auth_user();
    $taskId = i($_GET['task_id'] ?? 0);
    if (!$taskId) json_error('task_id required');

    $stmt = db()->prepare(
        'SELECT tc.*, u.full_name, u.employee_id FROM task_comments tc
         JOIN users u ON u.id = tc.user_id WHERE tc.task_id = ? ORDER BY tc.created_at ASC'
    );
    $stmt->execute([$taskId]);
    json_ok($stmt->fetchAll());
}
