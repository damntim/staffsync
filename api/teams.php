<?php
/**
 * StaffSync — teams.php
 * Actions: list | get | create | update | delete | add_member | remove_member | members | tasks
 */
require_once __DIR__ . '/config.php';

$action = $_GET['action'] ?? body()['action'] ?? '';

match($action) {
    'list'          => action_list(),
    'get'           => action_get(),
    'create'        => action_create(),
    'update'        => action_update(),
    'delete'        => action_delete(),
    'add_member'    => action_add_member(),
    'remove_member' => action_remove_member(),
    'members'       => action_members(),
    'tasks'         => action_tasks(),
    default         => json_error("Unknown action: $action"),
};

/* ─────────────────── LIST ─────────────────── */
function action_list(): never {
    require_method('GET');
    $u = auth_user();

    $isManager = in_array($u['role'], ['MANAGER','HR','IT_ADMIN']);

    if ($isManager) {
        // Managers see their own teams; HR/IT see all
        if ($u['role'] === 'MANAGER') {
            $stmt = db()->prepare(
                'SELECT t.*, u.full_name as manager_name,
                        (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) as member_count,
                        (SELECT COUNT(*) FROM tasks tk WHERE tk.team_id = t.id) as task_count,
                        (SELECT COUNT(*) FROM tasks tk WHERE tk.team_id = t.id AND tk.status = \'DONE\') as done_count
                 FROM teams t JOIN users u ON u.id = t.manager_id
                 WHERE t.manager_id = ?
                 ORDER BY t.created_at DESC'
            );
            $stmt->execute([$u['user_id']]);
        } else {
            $stmt = db()->query(
                'SELECT t.*, u.full_name as manager_name,
                        (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) as member_count,
                        (SELECT COUNT(*) FROM tasks tk WHERE tk.team_id = t.id) as task_count,
                        (SELECT COUNT(*) FROM tasks tk WHERE tk.team_id = t.id AND tk.status = \'DONE\') as done_count
                 FROM teams t JOIN users u ON u.id = t.manager_id
                 ORDER BY t.created_at DESC'
            );
        }
    } else {
        // Employees see teams they belong to
        $stmt = db()->prepare(
            'SELECT t.*, u.full_name as manager_name,
                    (SELECT COUNT(*) FROM team_members tm2 WHERE tm2.team_id = t.id) as member_count,
                    (SELECT COUNT(*) FROM tasks tk WHERE tk.team_id = t.id AND tk.assignee_id = ?) as task_count,
                    (SELECT COUNT(*) FROM tasks tk WHERE tk.team_id = t.id AND tk.assignee_id = ? AND tk.status = \'DONE\') as done_count
             FROM teams t
             JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = ?
             JOIN users u ON u.id = t.manager_id
             ORDER BY t.name'
        );
        $stmt->execute([$u['user_id'], $u['user_id'], $u['user_id']]);
    }

    json_ok($stmt->fetchAll());
}

/* ─────────────────── GET ONE ─────────────────── */
function action_get(): never {
    require_method('GET');
    $u  = auth_user();
    $id = i($_GET['id'] ?? 0);
    if (!$id) json_error('id required');

    $stmt = db()->prepare(
        'SELECT t.*, u.full_name as manager_name FROM teams t
         JOIN users u ON u.id = t.manager_id WHERE t.id = ? LIMIT 1'
    );
    $stmt->execute([$id]);
    $team = $stmt->fetch();
    if (!$team) json_error('Team not found', 404);

    // Members
    $m = db()->prepare(
        'SELECT tm.role_tag, tm.added_at, u.id, u.full_name, u.employee_id, u.department, u.role, u.email
         FROM team_members tm JOIN users u ON u.id = tm.user_id WHERE tm.team_id = ? ORDER BY u.full_name'
    );
    $m->execute([$id]);
    $team['members'] = $m->fetchAll();

    json_ok($team);
}

/* ─────────────────── CREATE ─────────────────── */
function action_create(): never {
    require_method('POST');
    $u = auth_user(['MANAGER','HR','IT_ADMIN']);
    $b = body();

    $name = trim($b['name'] ?? '');
    if (!$name) json_error('Team name required');

    $dept  = trim($b['department'] ?? '');
    $desc  = trim($b['description'] ?? '');
    $color = preg_match('/^#[0-9a-f]{6}$/i', $b['color'] ?? '') ? $b['color'] : '#6366f1';
    $mgr   = $u['role'] === 'MANAGER' ? $u['user_id'] : i($b['manager_id'] ?? $u['user_id']);

    $stmt = db()->prepare(
        'INSERT INTO teams (name, description, department, manager_id, color) VALUES (?, ?, ?, ?, ?)'
    );
    $stmt->execute([$name, $desc, $dept, $mgr, $color]);
    $teamId = (int)db()->lastInsertId();

    // Auto-add members if provided
    foreach ($b['member_ids'] ?? [] as $uid) {
        $uid = i($uid);
        if ($uid) {
            db()->prepare('INSERT IGNORE INTO team_members (team_id, user_id) VALUES (?, ?)')->execute([$teamId, $uid]);
        }
    }

    audit_log($u['user_id'], 'team_create', "Team '$name' created (id=$teamId)", 'teams');
    json_ok(['team_id' => $teamId], 201);
}

/* ─────────────────── UPDATE ─────────────────── */
function action_update(): never {
    require_method('POST');
    $u  = auth_user(['MANAGER','HR','IT_ADMIN']);
    $b  = body();
    $id = i($b['team_id'] ?? 0);
    if (!$id) json_error('team_id required');

    $fields = [];
    $params = [];
    foreach (['name','description','department','color'] as $col) {
        if (isset($b[$col])) { $fields[] = "$col = ?"; $params[] = trim($b[$col]); }
    }
    if (!$fields) json_error('Nothing to update');
    $params[] = $id;
    db()->prepare('UPDATE teams SET ' . implode(', ', $fields) . ', updated_at = NOW() WHERE id = ?')->execute($params);

    audit_log($u['user_id'], 'team_update', "Team $id updated", 'teams');
    json_ok('Updated');
}

/* ─────────────────── DELETE ─────────────────── */
function action_delete(): never {
    require_method('POST');
    $u  = auth_user(['MANAGER','HR','IT_ADMIN']);
    $b  = body();
    $id = i($b['team_id'] ?? 0);
    if (!$id) json_error('team_id required');

    db()->prepare('DELETE FROM team_members WHERE team_id = ?')->execute([$id]);
    db()->prepare('UPDATE tasks SET team_id = NULL WHERE team_id = ?')->execute([$id]);
    db()->prepare('DELETE FROM teams WHERE id = ?')->execute([$id]);

    audit_log($u['user_id'], 'team_delete', "Team $id deleted", 'teams');
    json_ok('Team deleted');
}

/* ─────────────────── ADD MEMBER ─────────────────── */
function action_add_member(): never {
    require_method('POST');
    $u  = auth_user(['MANAGER','HR','IT_ADMIN']);
    $b  = body();
    $teamId = i($b['team_id'] ?? 0);
    $userId = i($b['user_id'] ?? 0);
    $roleTag = trim($b['role_tag'] ?? 'member');
    if (!$teamId || !$userId) json_error('team_id and user_id required');

    db()->prepare('INSERT INTO team_members (team_id, user_id, role_tag) VALUES (?, ?, ?)
                   ON DUPLICATE KEY UPDATE role_tag = VALUES(role_tag)')
        ->execute([$teamId, $userId, $roleTag]);

    audit_log($u['user_id'], 'team_member_add', "User $userId added to team $teamId", 'teams');
    json_ok('Member added');
}

/* ─────────────────── REMOVE MEMBER ─────────────────── */
function action_remove_member(): never {
    require_method('POST');
    $u  = auth_user(['MANAGER','HR','IT_ADMIN']);
    $b  = body();
    $teamId = i($b['team_id'] ?? 0);
    $userId = i($b['user_id'] ?? 0);
    if (!$teamId || !$userId) json_error('team_id and user_id required');

    db()->prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?')->execute([$teamId, $userId]);

    audit_log($u['user_id'], 'team_member_remove', "User $userId removed from team $teamId", 'teams');
    json_ok('Member removed');
}

/* ─────────────────── MEMBERS LIST ─────────────────── */
function action_members(): never {
    require_method('GET');
    auth_user();
    $teamId = i($_GET['team_id'] ?? 0);
    if (!$teamId) json_error('team_id required');

    $stmt = db()->prepare(
        'SELECT tm.role_tag, tm.added_at, u.id, u.full_name, u.employee_id, u.department, u.role, u.email
         FROM team_members tm JOIN users u ON u.id = tm.user_id
         WHERE tm.team_id = ? ORDER BY u.full_name'
    );
    $stmt->execute([$teamId]);
    json_ok($stmt->fetchAll());
}

/* ─────────────────── TEAM TASKS ─────────────────── */
function action_tasks(): never {
    require_method('GET');
    auth_user();
    $teamId = i($_GET['team_id'] ?? 0);
    if (!$teamId) json_error('team_id required');

    $stmt = db()->prepare(
        'SELECT t.*, u.full_name as assignee_name
         FROM tasks t JOIN users u ON u.id = t.assignee_id
         WHERE t.team_id = ?
         ORDER BY t.due_date ASC, t.priority DESC'
    );
    $stmt->execute([$teamId]);
    $tasks = $stmt->fetchAll();

    foreach ($tasks as &$task) {
        $sub = db()->prepare('SELECT COUNT(*) as total, SUM(is_done) as done FROM subtasks WHERE task_id = ?');
        $sub->execute([$task['id']]);
        $c = $sub->fetch();
        $task['subtask_total'] = (int)$c['total'];
        $task['subtask_done']  = (int)($c['done'] ?? 0);
        // Use manual progress_pct if no subtasks
        if ($task['subtask_total'] > 0) {
            $task['progress'] = round(($task['subtask_done'] / $task['subtask_total']) * 100);
        } else {
            $task['progress'] = (int)($task['progress_pct'] ?? 0);
        }
    }

    json_ok($tasks);
}
