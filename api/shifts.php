<?php
/**
 * StaffSync — shifts.php
 * Actions: list | create | update | delete
 *          assign | unassign | shift_members
 *          holidays | add_holiday | delete_holiday
 *
 * Tables used:
 *   shifts            — shift templates
 *   shift_members     — user ↔ shift assignments
 *   shift_holidays    — days off attached to a shift
 */
require_once __DIR__ . '/config.php';

/* ── Auto-create tables if missing ── */
boot_tables();

$action = $_GET['action'] ?? body()['action'] ?? '';

match($action) {
    'list'           => action_list(),
    'create'         => action_create(),
    'update'         => action_update(),
    'delete'         => action_delete(),
    'assign'         => action_assign(),
    'unassign'       => action_unassign(),
    'shift_members'  => action_shift_members(),
    'my_shift'       => action_my_shift(),
    'holidays'       => action_holidays(),
    'add_holiday'    => action_add_holiday(),
    'delete_holiday' => action_delete_holiday(),
    default          => json_error("Unknown action: $action"),
};

/* ── Create tables once ── */
function boot_tables(): void {
    $pdo = db();
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS shifts (
            id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            name            VARCHAR(100)  NOT NULL,
            description     TEXT          NULL,
            start_time      TIME          NOT NULL DEFAULT '09:00:00',
            end_time        TIME          NOT NULL DEFAULT '17:00:00',
            days_of_week    VARCHAR(20)   NOT NULL DEFAULT '1,2,3,4,5',
            grace_minutes   SMALLINT      NOT NULL DEFAULT 15,
            color           VARCHAR(10)   NOT NULL DEFAULT '#6366f1',
            is_active       TINYINT(1)    NOT NULL DEFAULT 1,
            created_by      INT UNSIGNED  NULL,
            created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS shift_members (
            id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            shift_id   INT UNSIGNED NOT NULL,
            user_id    INT UNSIGNED NOT NULL,
            assigned_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            assigned_by INT UNSIGNED NULL,
            UNIQUE KEY uq_shift_user (shift_id, user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS shift_holidays (
            id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            shift_id    INT UNSIGNED  NULL COMMENT 'NULL = applies to all shifts',
            name        VARCHAR(100)  NOT NULL,
            date        DATE          NOT NULL,
            type        ENUM('public','company','optional') NOT NULL DEFAULT 'public',
            created_by  INT UNSIGNED  NULL,
            created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_shift_date (shift_id, date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
}

/* ── LIST SHIFTS ── */
function action_list(): never {
    require_method('GET');
    auth_user(['HR','IT_ADMIN','MANAGER']);

    $stmt = db()->query("
        SELECT s.*,
               COUNT(sm.user_id) AS member_count
        FROM shifts s
        LEFT JOIN shift_members sm ON sm.shift_id = s.id
        GROUP BY s.id
        ORDER BY s.name
    ");
    json_ok($stmt->fetchAll());
}

/* ── CREATE SHIFT ── */
function action_create(): never {
    require_method('POST');
    $u = auth_user(['HR','IT_ADMIN']);
    $b = body();

    $name = trim($b['name'] ?? '');
    if (!$name) json_error('Shift name required');

    $stmt = db()->prepare("
        INSERT INTO shifts (name, description, start_time, end_time, days_of_week, grace_minutes, color, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ");
    $stmt->execute([
        $name,
        trim($b['description'] ?? ''),
        $b['start_time']   ?? '09:00:00',
        $b['end_time']     ?? '17:00:00',
        $b['days_of_week'] ?? '1,2,3,4,5',
        i($b['grace_minutes'] ?? 15),
        $b['color']        ?? '#6366f1',
        $u['user_id'],
    ]);
    $shiftId = (int) db()->lastInsertId();

    audit_log($u['user_id'], 'shift_create', "Shift '$name' created", 'shifts');
    json_ok(['shift_id' => $shiftId], 201);
}

/* ── UPDATE SHIFT ── */
function action_update(): never {
    require_method('POST');
    $u       = auth_user(['HR','IT_ADMIN']);
    $b       = body();
    $shiftId = i($b['shift_id'] ?? 0);
    if (!$shiftId) json_error('shift_id required');

    $fields = [];
    $params = [];
    $map = ['name','description','start_time','end_time','days_of_week','grace_minutes','color','is_active'];
    foreach ($map as $f) {
        if (array_key_exists($f, $b)) { $fields[] = "`$f` = ?"; $params[] = $b[$f]; }
    }
    if (!$fields) json_error('Nothing to update');

    $params[] = $shiftId;
    db()->prepare('UPDATE shifts SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);

    audit_log($u['user_id'], 'shift_update', "Shift #$shiftId updated", 'shifts');
    json_ok('Shift updated');
}

/* ── DELETE SHIFT ── */
function action_delete(): never {
    require_method('POST');
    $u       = auth_user(['HR','IT_ADMIN']);
    $b       = body();
    $shiftId = i($b['shift_id'] ?? 0);
    if (!$shiftId) json_error('shift_id required');

    db()->prepare('DELETE FROM shift_members  WHERE shift_id = ?')->execute([$shiftId]);
    db()->prepare('DELETE FROM shift_holidays WHERE shift_id = ?')->execute([$shiftId]);
    db()->prepare('DELETE FROM shifts         WHERE id       = ?')->execute([$shiftId]);

    audit_log($u['user_id'], 'shift_delete', "Shift #$shiftId deleted", 'shifts');
    json_ok('Shift deleted');
}

/* ── ASSIGN USER TO SHIFT ── */
function action_assign(): never {
    require_method('POST');
    $u    = auth_user(['HR','IT_ADMIN']);
    $b    = body();
    $sid  = i($b['shift_id'] ?? 0);
    $uids = (array)($b['user_ids'] ?? []);   // accepts array or single

    if (!$sid || !$uids) json_error('shift_id and user_ids required');

    // Fetch shift info for email
    $shift = db()->prepare('SELECT * FROM shifts WHERE id = ? LIMIT 1');
    $shift->execute([$sid]);
    $shiftRow = $shift->fetch();
    if (!$shiftRow) json_error('Shift not found', 404);

    $inserted = 0;
    foreach ($uids as $uid) {
        $uid = i($uid);
        if (!$uid) continue;

        // Remove from any previous shift first
        db()->prepare('DELETE FROM shift_members WHERE user_id = ?')->execute([$uid]);

        try {
            db()->prepare('INSERT INTO shift_members (shift_id, user_id, assigned_by) VALUES (?,?,?)')
                ->execute([$sid, $uid, $u['user_id']]);
            $inserted++;
        } catch (\PDOException) { /* already assigned — ignore */ }

        // Update users table shift_start / shift_end for attendance calculations
        $startCol = col_exists_att('shift_start') ? 'shift_start' : null;
        $endCol   = col_exists_att('shift_end')   ? 'shift_end'   : null;
        if ($startCol) {
            db()->prepare("UPDATE users SET shift_start = ?, shift_end = ? WHERE id = ?")
                ->execute([$shiftRow['start_time'], $shiftRow['end_time'], $uid]);
        }

        // Send email
        $userRow = db()->prepare('SELECT full_name, email FROM users WHERE id = ? LIMIT 1');
        $userRow->execute([$uid]);
        $usr = $userRow->fetch();
        if ($usr && $usr['email']) {
            send_shift_email($usr['full_name'], $usr['email'], $shiftRow, 'assigned');
        }
    }

    audit_log($u['user_id'], 'shift_assign', "Assigned " . count($uids) . " user(s) to shift #{$sid}", 'shifts');
    json_ok(['assigned' => $inserted]);
}

/* ── UNASSIGN USER ── */
function action_unassign(): never {
    require_method('POST');
    $u   = auth_user(['HR','IT_ADMIN']);
    $b   = body();
    $sid = i($b['shift_id'] ?? 0);
    $uid = i($b['user_id']  ?? 0);
    if (!$sid || !$uid) json_error('shift_id and user_id required');

    db()->prepare('DELETE FROM shift_members WHERE shift_id = ? AND user_id = ?')->execute([$sid, $uid]);

    audit_log($u['user_id'], 'shift_unassign', "Removed user #$uid from shift #$sid", 'shifts');
    json_ok('User removed from shift');
}

/* ── SHIFT MEMBERS ── */
function action_shift_members(): never {
    require_method('GET');
    auth_user(['HR','IT_ADMIN','MANAGER']);
    $sid = i($_GET['shift_id'] ?? 0);
    if (!$sid) json_error('shift_id required');

    $stmt = db()->prepare("
        SELECT u.id, u.full_name, u.email, u.employee_id, u.department, u.role,
               sm.assigned_at
        FROM shift_members sm
        JOIN users u ON u.id = sm.user_id
        WHERE sm.shift_id = ?
        ORDER BY u.full_name
    ");
    $stmt->execute([$sid]);
    json_ok($stmt->fetchAll());
}

/* ── MY SHIFT (employee) ── */
function action_my_shift(): never {
    require_method('GET');
    $u = auth_user();

    $stmt = db()->prepare("
        SELECT s.*, sm.assigned_at
        FROM shift_members sm
        JOIN shifts s ON s.id = sm.shift_id
        WHERE sm.user_id = ?
        LIMIT 1
    ");
    $stmt->execute([$u['user_id']]);
    $row = $stmt->fetch();

    if ($row) {
        // Fetch upcoming holidays for this shift
        $hols = db()->prepare("
            SELECT * FROM shift_holidays
            WHERE (shift_id = ? OR shift_id IS NULL)
              AND date >= CURDATE()
            ORDER BY date LIMIT 10
        ");
        $hols->execute([$row['id']]);
        $row['upcoming_holidays'] = $hols->fetchAll();
    }

    json_ok($row ?: null);
}

/* ── LIST HOLIDAYS ── */
function action_holidays(): never {
    require_method('GET');
    auth_user();
    $sid  = i($_GET['shift_id'] ?? 0);
    $year = i($_GET['year']     ?? date('Y'));

    $sql    = "SELECT * FROM shift_holidays WHERE YEAR(date) = ?";
    $params = [$year];
    if ($sid) { $sql .= ' AND (shift_id = ? OR shift_id IS NULL)'; $params[] = $sid; }
    $sql .= ' ORDER BY date';

    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    json_ok($stmt->fetchAll());
}

/* ── ADD HOLIDAY ── */
function action_add_holiday(): never {
    require_method('POST');
    $u = auth_user(['HR','IT_ADMIN']);
    $b = body();

    $name = trim($b['name'] ?? '');
    $date = $b['date'] ?? '';
    if (!$name || !$date) json_error('name and date required');

    $sid = $b['shift_id'] ? i($b['shift_id']) : null;

    try {
        db()->prepare("
            INSERT INTO shift_holidays (shift_id, name, date, type, created_by)
            VALUES (?, ?, ?, ?, ?)
        ")->execute([$sid, $name, $date, $b['type'] ?? 'public', $u['user_id']]);
    } catch (\PDOException) {
        json_error('Holiday already exists for this date', 409);
    }

    audit_log($u['user_id'], 'holiday_add', "Holiday '$name' on $date", 'shifts');
    json_ok(['holiday_id' => (int)db()->lastInsertId()], 201);
}

/* ── DELETE HOLIDAY ── */
function action_delete_holiday(): never {
    require_method('POST');
    $u  = auth_user(['HR','IT_ADMIN']);
    $id = i(body()['holiday_id'] ?? 0);
    if (!$id) json_error('holiday_id required');

    db()->prepare('DELETE FROM shift_holidays WHERE id = ?')->execute([$id]);
    audit_log($u['user_id'], 'holiday_delete', "Holiday #$id deleted", 'shifts');
    json_ok('Holiday deleted');
}

/* ── Helpers ── */
function col_exists_att(string $col): bool {
    $r = db()->query("SHOW COLUMNS FROM users LIKE '$col'");
    return (bool)$r->fetch();
}

function send_shift_email(string $name, string $email, array $shift, string $type): void {
    $days = days_label($shift['days_of_week'] ?? '1,2,3,4,5');
    $start = substr($shift['start_time'], 0, 5);
    $end   = substr($shift['end_time'],   0, 5);
    $shiftName = htmlspecialchars($shift['name']);
    $color     = $shift['color'] ?? '#6366f1';

    $subject = $type === 'assigned'
        ? "You've been assigned to shift: {$shift['name']}"
        : "Your shift has been updated: {$shift['name']}";

    $typeLabel = $type === 'assigned'
        ? 'You have been assigned to a work shift.'
        : 'Your shift schedule has been updated.';

    $html = <<<HTML
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0d1117;font-family:Inter,sans-serif">
<div style="max-width:520px;margin:40px auto;background:#111827;border-radius:16px;overflow:hidden;border:1px solid rgba(99,102,241,0.2)">
  <div style="background:linear-gradient(135deg,{$color}22,{$color}11);padding:32px;border-bottom:1px solid rgba(99,102,241,0.15)">
    <div style="width:48px;height:48px;background:{$color}22;border:1.5px solid {$color}55;border-radius:12px;display:flex;align-items:center;justify-content:center;margin-bottom:16px">
      <span style="font-size:22px">⏰</span>
    </div>
    <h1 style="margin:0;font-size:20px;font-weight:800;color:#e2e8f0">Shift Assignment</h1>
    <p style="margin:8px 0 0;color:#94a3b8;font-size:14px">
      {$typeLabel}
    </p>
  </div>
  <div style="padding:28px">
    <p style="margin:0 0 20px;color:#cbd5e1;font-size:14px">Hi <strong style="color:#e2e8f0">{$name}</strong>,</p>
    <div style="background:rgba(26,34,54,0.6);border:1px solid rgba(99,102,241,0.15);border-radius:12px;padding:20px;margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <div style="width:10px;height:10px;border-radius:50%;background:{$color};box-shadow:0 0 8px {$color}99;flex-shrink:0"></div>
        <span style="font-size:17px;font-weight:700;color:#e2e8f0">{$shiftName}</span>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:6px 0;color:#64748b;font-size:12px;width:120px">Start time</td>
          <td style="padding:6px 0;color:#e2e8f0;font-size:13px;font-weight:600">{$start}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#64748b;font-size:12px">End time</td>
          <td style="padding:6px 0;color:#e2e8f0;font-size:13px;font-weight:600">{$end}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#64748b;font-size:12px">Working days</td>
          <td style="padding:6px 0;color:#e2e8f0;font-size:13px;font-weight:600">{$days}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#64748b;font-size:12px">Grace period</td>
          <td style="padding:6px 0;color:#e2e8f0;font-size:13px;font-weight:600">{$shift['grace_minutes']} minutes</td>
        </tr>
      </table>
    </div>
    <p style="margin:0 0 24px;color:#94a3b8;font-size:13px;line-height:1.6">
      Please make sure to check in on time. Late arrivals beyond the grace period will be marked as <strong style="color:#f59e0b">LATE</strong>.
    </p>
    <a href="http://localhost:5173/dashboard/employee/check-in"
       style="display:inline-block;background:{$color};color:white;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:13px;font-weight:600">
      Open Check-In
    </a>
  </div>
  <div style="padding:20px 28px;border-top:1px solid rgba(99,102,241,0.1);text-align:center">
    <p style="margin:0;color:#475569;font-size:11px">StaffSync · DevX Ltd · This is an automated message</p>
  </div>
</div>
</body></html>
HTML;

    send_mail($email, $name, $subject, $html);
}

function days_label(string $days): string {
    $map = ['1'=>'Mon','2'=>'Tue','3'=>'Wed','4'=>'Thu','5'=>'Fri','6'=>'Sat','0'=>'Sun'];
    $parts = array_map(fn($d) => $map[trim($d)] ?? $d, explode(',', $days));
    return implode(', ', $parts);
}
