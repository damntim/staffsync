<?php
/**
 * StaffSync — policy.php
 * Actions: list | update
 * Table: policies (id, name, icon, color, version, status, updated_at, rules JSON)
 */
require_once __DIR__ . '/config.php';

$action = $_GET['action'] ?? '';

match($action) {
    'list'   => action_list(),
    'update' => action_update(),
    default  => json_error("Unknown action: $action", 400),
};

/* ── bootstrap table & seed ── */
function bootstrap(): void {
    db()->exec("CREATE TABLE IF NOT EXISTS policies (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        name       VARCHAR(120)  NOT NULL,
        icon       VARCHAR(10)   NOT NULL DEFAULT '📋',
        color      VARCHAR(10)   NOT NULL DEFAULT '#6366f1',
        version    VARCHAR(10)   NOT NULL DEFAULT 'v1.0',
        status     VARCHAR(20)   NOT NULL DEFAULT 'published',
        rules      LONGTEXT      NOT NULL DEFAULT '[]',
        updated_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $count = db()->query('SELECT COUNT(*) FROM policies')->fetchColumn();
    if ($count > 0) return;

    /* Seed defaults */
    $defaults = [
        [
            'name' => 'Leave Policy', 'icon' => '🏖️', 'color' => '#6366f1', 'version' => 'v3.2',
            'rules' => json_encode([
                ['id' => 11, 'label' => 'Annual leave entitlement',   'value' => '20 days/year',   'editable' => true],
                ['id' => 12, 'label' => 'Sick leave entitlement',     'value' => '10 days/year',   'editable' => true],
                ['id' => 13, 'label' => 'Casual leave entitlement',   'value' => '5 days/year',    'editable' => true],
                ['id' => 14, 'label' => 'Min notice (annual leave)',  'value' => '3 working days', 'editable' => true],
                ['id' => 15, 'label' => 'Max consecutive leave days', 'value' => '14 days',        'editable' => true],
                ['id' => 16, 'label' => 'Carry-over allowed',         'value' => '5 days max',     'editable' => true],
            ]),
        ],
        [
            'name' => 'Attendance Policy', 'icon' => '⏰', 'color' => '#10b981', 'version' => 'v2.1',
            'rules' => json_encode([
                ['id' => 21, 'label' => 'Check-in window',          'value' => '06:30 – 09:00',   'editable' => true],
                ['id' => 22, 'label' => 'Late threshold',            'value' => '15 minutes',      'editable' => true],
                ['id' => 23, 'label' => 'Late = absent threshold',  'value' => '3 lates/month',   'editable' => true],
                ['id' => 24, 'label' => 'WFH allowed',              'value' => 'Manager approval', 'editable' => true],
                ['id' => 25, 'label' => 'GPS monitoring hours',      'value' => 'Shift hours only','editable' => false],
            ]),
        ],
        [
            'name' => 'Face Biometric Policy', 'icon' => '🫡', 'color' => '#a78bfa', 'version' => 'v1.0',
            'rules' => json_encode([
                ['id' => 31, 'label' => 'Enrollment required',     'value' => 'Yes — mandatory',   'editable' => false],
                ['id' => 32, 'label' => 'Enrollment deadline',     'value' => '30 days from hire', 'editable' => true],
                ['id' => 33, 'label' => 'Liveness check',          'value' => 'Required (blink)',  'editable' => false],
                ['id' => 34, 'label' => 'Re-enrollment approval',  'value' => 'HR Officer',        'editable' => true],
                ['id' => 35, 'label' => 'GDPR consent required',   'value' => 'Yes',               'editable' => false],
                ['id' => 36, 'label' => 'Descriptor encryption',   'value' => 'AES-256',           'editable' => false],
            ]),
        ],
        [
            'name' => 'QR Check-in Policy', 'icon' => '📲', 'color' => '#f59e0b', 'version' => 'v1.1', 'status_override' => 'draft',
            'rules' => json_encode([
                ['id' => 41, 'label' => 'QR token rotation',      'value' => 'Every 30 seconds', 'editable' => true],
                ['id' => 42, 'label' => 'QR + Geofence required', 'value' => 'Yes — both layers','editable' => false],
                ['id' => 43, 'label' => 'Face verify required',   'value' => 'Yes — third layer','editable' => false],
                ['id' => 44, 'label' => 'Failure lockout',        'value' => '3 attempts',       'editable' => true],
            ]),
        ],
    ];

    $ins = db()->prepare(
        'INSERT INTO policies (name, icon, color, version, status, rules) VALUES (?,?,?,?,?,?)'
    );
    foreach ($defaults as $d) {
        $ins->execute([
            $d['name'], $d['icon'], $d['color'], $d['version'],
            $d['status_override'] ?? 'published',
            $d['rules'],
        ]);
    }
}

/* ────────────────────────────────────────────────────
   LIST
──────────────────────────────────────────────────── */
function action_list(): never {
    auth_user(); // require login
    bootstrap();

    $rows = db()->query(
        'SELECT id, name, icon, color, version, status, rules,
                DATE_FORMAT(updated_at, "%b %e, %Y") AS updated_at
         FROM policies ORDER BY id'
    )->fetchAll();

    foreach ($rows as &$r) {
        $r['rules'] = json_decode($r['rules'], true) ?? [];
    }

    json_ok($rows);
}

/* ────────────────────────────────────────────────────
   UPDATE
──────────────────────────────────────────────────── */
function action_update(): never {
    require_method('POST');
    $u = auth_user();
    if (!in_array($u['role'], ['HR', 'IT_ADMIN'])) json_error('Forbidden', 403);

    bootstrap();
    $b = body();

    $id    = (int) ($b['policy_id'] ?? 0);
    $rules = $b['rules'] ?? null;   // array of {id, value}

    if (!$id || !is_array($rules)) json_error('policy_id and rules required', 400);

    /* Fetch existing */
    $stmt = db()->prepare('SELECT * FROM policies WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $policy = $stmt->fetch();
    if (!$policy) json_error('Policy not found', 404);

    /* Merge editable rules only */
    $existing = json_decode($policy['rules'], true) ?? [];
    $patchMap = [];
    foreach ($rules as $r) {
        if (isset($r['id'], $r['value'])) $patchMap[(int)$r['id']] = $r['value'];
    }
    foreach ($existing as &$rule) {
        if ($rule['editable'] && isset($patchMap[$rule['id']])) {
            $rule['value'] = $patchMap[$rule['id']];
        }
    }
    unset($rule);

    /* Bump version minor */
    $vParts  = explode('.', ltrim($policy['version'], 'v'));
    $newVer  = 'v' . $vParts[0] . '.' . ((int)($vParts[1] ?? 0) + 1);

    db()->prepare(
        'UPDATE policies SET rules = ?, version = ?, status = "published", updated_at = NOW() WHERE id = ?'
    )->execute([json_encode($existing), $newVer, $id]);

    audit_log($u['user_id'], 'policy_update', "Policy #{$id} updated to {$newVer}", 'policy');
    json_ok(['version' => $newVer, 'message' => 'Policy saved and published']);
}
