<?php
/**
 * StaffSync — payroll.php
 *
 * Actions:
 *   salary_list | salary_set
 *   deduction_list | deduction_add | deduction_delete
 *   run_list | run_create | run_process | run_submit | run_approve | run_reject | run_finalize
 *   entry_list | entry_adjust
 *   payslip_list | payslip_get | payslip_send | payslip_pdf
 *   complaint_list | complaint_add | complaint_reply | complaint_resolve
 *   dashboard_stats
 */
require_once __DIR__ . '/config.php';

boot_payroll_tables();

$action = $_GET['action'] ?? body()['action'] ?? '';

match ($action) {
    'salary_list'        => action_salary_list(),
    'salary_set'         => action_salary_set(),
    'deduction_list'     => action_deduction_list(),
    'deduction_add'      => action_deduction_add(),
    'deduction_delete'   => action_deduction_delete(),
    'run_list'           => action_run_list(),
    'run_create'         => action_run_create(),
    'run_process'        => action_run_process(),
    'run_submit'         => action_run_submit(),
    'run_approve'        => action_run_approve(),
    'run_reject'         => action_run_reject(),
    'run_finalize'       => action_run_finalize(),
    'entry_list'         => action_entry_list(),
    'entry_adjust'       => action_entry_adjust(),
    'payslip_list'       => action_payslip_list(),
    'payslip_get'        => action_payslip_get(),
    'payslip_send'       => action_payslip_send(),
    'payslip_pdf'        => action_payslip_pdf(),
    'complaint_list'     => action_complaint_list(),
    'complaint_add'      => action_complaint_add(),
    'complaint_reply'    => action_complaint_reply(),
    'complaint_resolve'  => action_complaint_resolve(),
    'dashboard_stats'    => action_dashboard_stats(),
    default              => json_error("Unknown action: $action"),
};

/* ════════════════════════════════════════════
   BOOT — create tables if missing
════════════════════════════════════════════ */
function boot_payroll_tables(): void {
    $pdo = db();

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS salary_configs (
            id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            user_id         INT UNSIGNED NOT NULL UNIQUE,
            basic_salary    DECIMAL(14,2) NOT NULL DEFAULT 0,
            currency        VARCHAR(5)  NOT NULL DEFAULT 'RWF',
            pay_frequency   ENUM('monthly','biweekly') NOT NULL DEFAULT 'monthly',
            has_brd_loan    TINYINT(1)  NOT NULL DEFAULT 0,
            overtime_rate   DECIMAL(5,2) NOT NULL DEFAULT 1.5,
            effective_from  DATE        NOT NULL DEFAULT (CURDATE()),
            notes           TEXT        NULL,
            created_by      INT UNSIGNED NULL,
            updated_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS deduction_templates (
            id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            name         VARCHAR(100) NOT NULL,
            type         ENUM('percentage','fixed') NOT NULL DEFAULT 'percentage',
            value        DECIMAL(10,4) NOT NULL DEFAULT 0,
            applies_to   ENUM('all','individual') NOT NULL DEFAULT 'all',
            is_mandatory TINYINT(1)   NOT NULL DEFAULT 0,
            description  TEXT         NULL,
            created_by   INT UNSIGNED NULL,
            created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS payroll_runs (
            id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            period_label     VARCHAR(30)  NOT NULL,
            period_start     DATE         NOT NULL,
            period_end       DATE         NOT NULL,
            status           ENUM('draft','processing','pending_manager','pending_hr','approved','rejected','paid')
                             NOT NULL DEFAULT 'draft',
            total_gross      DECIMAL(16,2) NOT NULL DEFAULT 0,
            total_deductions DECIMAL(16,2) NOT NULL DEFAULT 0,
            total_net        DECIMAL(16,2) NOT NULL DEFAULT 0,
            employee_count   SMALLINT      NOT NULL DEFAULT 0,
            notes            TEXT          NULL,
            rejection_reason TEXT          NULL,
            created_by       INT UNSIGNED  NOT NULL,
            approved_by_manager INT UNSIGNED NULL,
            approved_by_hr      INT UNSIGNED NULL,
            finalized_by        INT UNSIGNED NULL,
            created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            processed_at     DATETIME     NULL,
            paid_at          DATETIME     NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS payroll_entries (
            id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            run_id           INT UNSIGNED NOT NULL,
            user_id          INT UNSIGNED NOT NULL,
            basic_salary     DECIMAL(14,2) NOT NULL DEFAULT 0,
            overtime_hours   DECIMAL(6,2)  NOT NULL DEFAULT 0,
            overtime_amount  DECIMAL(14,2) NOT NULL DEFAULT 0,
            bonus            DECIMAL(14,2) NOT NULL DEFAULT 0,
            gross            DECIMAL(14,2) NOT NULL DEFAULT 0,
            paye             DECIMAL(14,2) NOT NULL DEFAULT 0,
            rssb_pension     DECIMAL(14,2) NOT NULL DEFAULT 0,
            rssb_medical     DECIMAL(14,2) NOT NULL DEFAULT 0,
            brd_loan         DECIMAL(14,2) NOT NULL DEFAULT 0,
            other_deductions DECIMAL(14,2) NOT NULL DEFAULT 0,
            total_deductions DECIMAL(14,2) NOT NULL DEFAULT 0,
            net_pay          DECIMAL(14,2) NOT NULL DEFAULT 0,
            deduction_details JSON          NULL,
            adjusted_by      INT UNSIGNED  NULL,
            adjusted_at      DATETIME      NULL,
            UNIQUE KEY uq_run_user (run_id, user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS payslip_complaints (
            id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            entry_id    INT UNSIGNED NOT NULL,
            user_id     INT UNSIGNED NOT NULL,
            subject     VARCHAR(200) NOT NULL,
            message     TEXT         NOT NULL,
            status      ENUM('open','in_review','resolved') NOT NULL DEFAULT 'open',
            reply       TEXT         NULL,
            replied_by  INT UNSIGNED NULL,
            created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            resolved_at DATETIME     NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
}

/* ════════════════════════════════════════════
   SALARY
════════════════════════════════════════════ */
function action_salary_list(): never {
    require_method('GET');
    auth_user(['FINANCE','HR','IT_ADMIN']);
    $stmt = db()->query("
        SELECT sc.*, u.full_name, u.email, u.employee_id, u.department
        FROM salary_configs sc
        JOIN users u ON u.id = sc.user_id
        ORDER BY u.full_name
    ");
    json_ok($stmt->fetchAll());
}

function action_salary_set(): never {
    require_method('POST');
    $u = auth_user(['FINANCE','HR','IT_ADMIN']);
    $b = body();

    $uid = i($b['user_id'] ?? 0);
    if (!$uid) json_error('user_id required');

    $pdo    = db();
    $exists = $pdo->prepare('SELECT id FROM salary_configs WHERE user_id=? LIMIT 1');
    $exists->execute([$uid]);

    if ($exists->fetch()) {
        $pdo->prepare("
            UPDATE salary_configs SET
                basic_salary=?,currency=?,pay_frequency=?,has_brd_loan=?,
                overtime_rate=?,effective_from=?,notes=?,created_by=?
            WHERE user_id=?
        ")->execute([
            f($b['basic_salary'] ?? 0), $b['currency'] ?? 'RWF',
            $b['pay_frequency'] ?? 'monthly', i($b['has_brd_loan'] ?? 0),
            f($b['overtime_rate'] ?? 1.5), $b['effective_from'] ?? date('Y-m-01'),
            $b['notes'] ?? null, $u['user_id'], $uid,
        ]);
    } else {
        $pdo->prepare("
            INSERT INTO salary_configs
                (user_id,basic_salary,currency,pay_frequency,has_brd_loan,overtime_rate,effective_from,notes,created_by)
            VALUES (?,?,?,?,?,?,?,?,?)
        ")->execute([
            $uid, f($b['basic_salary'] ?? 0), $b['currency'] ?? 'RWF',
            $b['pay_frequency'] ?? 'monthly', i($b['has_brd_loan'] ?? 0),
            f($b['overtime_rate'] ?? 1.5), $b['effective_from'] ?? date('Y-m-01'),
            $b['notes'] ?? null, $u['user_id'],
        ]);
    }

    audit_log($u['user_id'], 'salary_set', "Salary set for user #$uid", 'payroll');
    json_ok('Salary updated');
}

/* ════════════════════════════════════════════
   DEDUCTIONS
════════════════════════════════════════════ */
function action_deduction_list(): never {
    require_method('GET');
    auth_user(['FINANCE','HR','IT_ADMIN']);
    json_ok(db()->query('SELECT * FROM deduction_templates ORDER BY is_mandatory DESC, name')->fetchAll());
}

function action_deduction_add(): never {
    require_method('POST');
    $u = auth_user(['FINANCE','HR','IT_ADMIN']);
    $b = body();
    if (!trim($b['name'] ?? '')) json_error('name required');
    db()->prepare("
        INSERT INTO deduction_templates (name,type,value,applies_to,is_mandatory,description,created_by)
        VALUES (?,?,?,?,?,?,?)
    ")->execute([
        trim($b['name']), $b['type'] ?? 'percentage', f($b['value'] ?? 0),
        $b['applies_to'] ?? 'all', i($b['is_mandatory'] ?? 0),
        trim($b['description'] ?? ''), $u['user_id'],
    ]);
    audit_log($u['user_id'], 'deduction_add', "Deduction '{$b['name']}' added", 'payroll');
    json_ok(['deduction_id' => (int)db()->lastInsertId()], 201);
}

function action_deduction_delete(): never {
    require_method('POST');
    $u  = auth_user(['FINANCE','HR','IT_ADMIN']);
    $id = i(body()['deduction_id'] ?? 0);
    if (!$id) json_error('deduction_id required');
    db()->prepare('DELETE FROM deduction_templates WHERE id=?')->execute([$id]);
    audit_log($u['user_id'], 'deduction_delete', "Deduction #$id deleted", 'payroll');
    json_ok('Deleted');
}

/* ════════════════════════════════════════════
   PAYROLL RUNS
════════════════════════════════════════════ */
function action_run_list(): never {
    require_method('GET');
    auth_user(['FINANCE','HR','MANAGER','IT_ADMIN']);
    $stmt = db()->query("
        SELECT r.*, u.full_name AS created_by_name
        FROM payroll_runs r LEFT JOIN users u ON u.id = r.created_by
        ORDER BY r.period_start DESC LIMIT 24
    ");
    json_ok($stmt->fetchAll());
}

function action_run_create(): never {
    require_method('POST');
    $u     = auth_user(['FINANCE']);
    $b     = body();
    $start = $b['period_start'] ?? date('Y-m-01');
    $end   = $b['period_end']   ?? date('Y-m-t');
    $label = $b['period_label'] ?? date('F Y', strtotime($start));

    $dup = db()->prepare('SELECT id FROM payroll_runs WHERE period_start=? AND period_end=? LIMIT 1');
    $dup->execute([$start, $end]);
    if ($dup->fetch()) json_error('A payroll run already exists for this period', 409);

    db()->prepare("INSERT INTO payroll_runs (period_label,period_start,period_end,status,created_by) VALUES (?,?,?,'draft',?)")
        ->execute([$label, $start, $end, $u['user_id']]);

    $runId = (int)db()->lastInsertId();
    audit_log($u['user_id'], 'run_create', "Payroll run '$label' created", 'payroll');
    json_ok(['run_id' => $runId], 201);
}

function action_run_process(): never {
    require_method('POST');
    $u     = auth_user(['FINANCE']);
    $runId = i(body()['run_id'] ?? 0);
    if (!$runId) json_error('run_id required');

    $run = get_run($runId);
    if (!$run) json_error('Run not found', 404);
    if (!in_array($run['status'], ['draft','rejected'])) json_error('Run is not in draft/rejected state');

    $employees = db()->query("
        SELECT sc.*, u.full_name, u.email, u.id AS uid
        FROM salary_configs sc JOIN users u ON u.id=sc.user_id WHERE u.is_active=1
    ")->fetchAll();
    if (!$employees) json_error('No employees with salary configs found');

    $deds         = db()->query("SELECT * FROM deduction_templates WHERE applies_to='all'")->fetchAll();
    $paye_rate    = get_template_rate($deds, 'PAYE',         30.0);
    $pension_rate = get_template_rate($deds, 'RSSB Pension',  5.0);
    $medical_rate = get_template_rate($deds, 'RSSB Medical',  2.5);

    $totalGross = 0; $totalDed = 0; $totalNet = 0;
    db()->prepare('DELETE FROM payroll_entries WHERE run_id=?')->execute([$runId]);

    $ins = db()->prepare("
        INSERT INTO payroll_entries
            (run_id,user_id,basic_salary,overtime_hours,overtime_amount,bonus,gross,
             paye,rssb_pension,rssb_medical,brd_loan,other_deductions,total_deductions,net_pay,deduction_details)
        VALUES (?,?,?,0,0,0,?,?,?,?,?,0,?,?,?)
    ");

    foreach ($employees as $emp) {
        $basic   = (float)$emp['basic_salary'];
        $gross   = $basic;
        $paye    = round($gross * $paye_rate    / 100, 2);
        $pension = round($gross * $pension_rate / 100, 2);
        $medical = round($gross * $medical_rate / 100, 2);
        $brd     = $emp['has_brd_loan'] ? round($gross * 8.0 / 100, 2) : 0.0;
        $details = [
            ['name'=>'PAYE',         'rate'=>$paye_rate,    'amount'=>$paye],
            ['name'=>'RSSB Pension', 'rate'=>$pension_rate, 'amount'=>$pension],
            ['name'=>'RSSB Medical', 'rate'=>$medical_rate, 'amount'=>$medical],
        ];
        if ($brd > 0) $details[] = ['name'=>'BRD Student Loan','rate'=>8.0,'amount'=>$brd];
        $totalDedEntry = $paye + $pension + $medical + $brd;
        $net = max(0, $gross - $totalDedEntry);
        $ins->execute([$runId,$emp['uid'],$basic,$gross,$paye,$pension,$medical,$brd,$totalDedEntry,$net,json_encode($details)]);
        $totalGross += $gross; $totalDed += $totalDedEntry; $totalNet += $net;
    }

    db()->prepare("
        UPDATE payroll_runs
        SET status='processing',total_gross=?,total_deductions=?,total_net=?,employee_count=?,processed_at=NOW()
        WHERE id=?
    ")->execute([$totalGross,$totalDed,$totalNet,count($employees),$runId]);

    audit_log($u['user_id'], 'run_process', "Payroll run #$runId processed", 'payroll');
    json_ok(['entries' => count($employees), 'total_net' => $totalNet]);
}

function action_run_submit(): never {
    require_method('POST');
    $u     = auth_user(['FINANCE']);
    $runId = i(body()['run_id'] ?? 0);
    $run   = get_run($runId);
    if (!$run) json_error('Run not found', 404);
    if ($run['status'] !== 'processing') json_error('Run must be processed before submission');
    db()->prepare("UPDATE payroll_runs SET status='pending_manager' WHERE id=?")->execute([$runId]);
    audit_log($u['user_id'], 'run_submit', "Payroll run #$runId submitted", 'payroll');
    json_ok('Submitted for manager approval');
}

function action_run_approve(): never {
    require_method('POST');
    $u     = auth_user(['MANAGER','HR']);
    $runId = i(body()['run_id'] ?? 0);
    $run   = get_run($runId);
    if (!$run) json_error('Run not found', 404);

    if ($u['role'] === 'MANAGER') {
        if ($run['status'] !== 'pending_manager') json_error('Not awaiting manager approval');
        db()->prepare("UPDATE payroll_runs SET status='pending_hr',approved_by_manager=? WHERE id=?")
            ->execute([$u['user_id'],$runId]);
        json_ok('Manager approved — sent to HR');
    }
    if ($u['role'] === 'HR') {
        if ($run['status'] !== 'pending_hr') json_error('Not awaiting HR approval');
        db()->prepare("UPDATE payroll_runs SET status='approved',approved_by_hr=? WHERE id=?")
            ->execute([$u['user_id'],$runId]);
        json_ok('HR approved — Finance can now finalize');
    }
    json_error('Unauthorized role for this approval step');
}

function action_run_reject(): never {
    require_method('POST');
    $u      = auth_user(['MANAGER','HR']);
    $b      = body();
    $runId  = i($b['run_id'] ?? 0);
    $reason = trim($b['reason'] ?? '');
    if (!$reason) json_error('Rejection reason required');
    $run = get_run($runId);
    if (!$run) json_error('Run not found', 404);
    db()->prepare("UPDATE payroll_runs SET status='rejected',rejection_reason=? WHERE id=?")
        ->execute([$reason,$runId]);
    json_ok('Run rejected — Finance must re-process');
}

function action_run_finalize(): never {
    require_method('POST');
    $u     = auth_user(['FINANCE']);
    $runId = i(body()['run_id'] ?? 0);
    $run   = get_run($runId);
    if (!$run) json_error('Run not found', 404);
    if ($run['status'] !== 'approved') json_error('Run must be approved before finalization');

    db()->prepare("UPDATE payroll_runs SET status='paid',finalized_by=?,paid_at=NOW() WHERE id=?")
        ->execute([$u['user_id'],$runId]);

    $entries = db()->prepare("
        SELECT pe.*, u.full_name, u.email, u.employee_id, u.department
        FROM payroll_entries pe JOIN users u ON u.id=pe.user_id WHERE pe.run_id=?
    ");
    $entries->execute([$runId]);
    $rows = $entries->fetchAll();
    $sent = 0;
    foreach ($rows as $row) {
        if ($row['email']) { send_payslip_email($row, $run); $sent++; }
    }

    audit_log($u['user_id'], 'run_finalize', "Payroll run #$runId finalized — $sent payslips sent", 'payroll');
    json_ok(['paid' => true, 'emails_sent' => $sent]);
}

/* ════════════════════════════════════════════
   ENTRIES
════════════════════════════════════════════ */
function action_entry_list(): never {
    require_method('GET');
    auth_user(['FINANCE','HR','MANAGER','IT_ADMIN']);
    $runId = i($_GET['run_id'] ?? 0);
    if (!$runId) json_error('run_id required');

    $stmt = db()->prepare("
        SELECT pe.*, u.full_name, u.email, u.employee_id, u.department,
               sc.has_brd_loan, sc.overtime_rate
        FROM payroll_entries pe
        JOIN users u ON u.id=pe.user_id
        LEFT JOIN salary_configs sc ON sc.user_id=pe.user_id
        WHERE pe.run_id=? ORDER BY u.full_name
    ");
    $stmt->execute([$runId]);
    json_ok($stmt->fetchAll());
}

function action_entry_adjust(): never {
    require_method('POST');
    $u       = auth_user(['FINANCE']);
    $b       = body();
    $entryId = i($b['entry_id'] ?? 0);
    if (!$entryId) json_error('entry_id required');

    $stmt = db()->prepare('SELECT * FROM payroll_entries WHERE id=? LIMIT 1');
    $stmt->execute([$entryId]);
    $entry = $stmt->fetch();
    if (!$entry) json_error('Entry not found', 404);

    $basic  = f($b['basic_salary']   ?? $entry['basic_salary']);
    $ovtHrs = f($b['overtime_hours'] ?? $entry['overtime_hours']);
    $bonus  = f($b['bonus']          ?? $entry['bonus']);

    $scStmt = db()->prepare('SELECT overtime_rate, has_brd_loan FROM salary_configs WHERE user_id=? LIMIT 1');
    $scStmt->execute([$entry['user_id']]);
    $sc      = $scStmt->fetch();
    $ovtRate = $sc ? (float)$sc['overtime_rate'] : 1.5;
    $hasBrd  = $sc ? (bool)$sc['has_brd_loan']   : false;

    $ovtAmt = round($ovtHrs * ($basic / 160) * $ovtRate, 2);
    $gross  = $basic + $ovtAmt + $bonus;

    $deds         = db()->query("SELECT * FROM deduction_templates WHERE applies_to='all'")->fetchAll();
    $paye_rate    = get_template_rate($deds, 'PAYE',         30.0);
    $pension_rate = get_template_rate($deds, 'RSSB Pension',  5.0);
    $medical_rate = get_template_rate($deds, 'RSSB Medical',  2.5);

    $paye    = round($gross * $paye_rate    / 100, 2);
    $pension = round($gross * $pension_rate / 100, 2);
    $medical = round($gross * $medical_rate / 100, 2);
    $brd     = $hasBrd ? round($gross * 8.0 / 100, 2) : 0.0;
    $other   = f($b['other_deductions'] ?? $entry['other_deductions']);
    $totalD  = $paye + $pension + $medical + $brd + $other;
    $net     = max(0, $gross - $totalD);

    $details = [
        ['name'=>'PAYE',         'rate'=>$paye_rate,    'amount'=>$paye],
        ['name'=>'RSSB Pension', 'rate'=>$pension_rate, 'amount'=>$pension],
        ['name'=>'RSSB Medical', 'rate'=>$medical_rate, 'amount'=>$medical],
    ];
    if ($brd > 0)   $details[] = ['name'=>'BRD Student Loan','rate'=>8.0,  'amount'=>$brd];
    if ($other > 0) $details[] = ['name'=>'Other',            'rate'=>0,    'amount'=>$other];

    db()->prepare("
        UPDATE payroll_entries SET
            basic_salary=?,overtime_hours=?,overtime_amount=?,bonus=?,gross=?,
            paye=?,rssb_pension=?,rssb_medical=?,brd_loan=?,other_deductions=?,
            total_deductions=?,net_pay=?,deduction_details=?,adjusted_by=?,adjusted_at=NOW()
        WHERE id=?
    ")->execute([$basic,$ovtHrs,$ovtAmt,$bonus,$gross,$paye,$pension,$medical,$brd,$other,$totalD,$net,json_encode($details),$u['user_id'],$entryId]);

    $t = db()->prepare("SELECT SUM(gross) AS tg, SUM(total_deductions) AS td, SUM(net_pay) AS tn FROM payroll_entries WHERE run_id=?");
    $t->execute([$entry['run_id']]);
    $totals = $t->fetch();
    db()->prepare("UPDATE payroll_runs SET total_gross=?,total_deductions=?,total_net=? WHERE id=?")
        ->execute([$totals['tg'],$totals['td'],$totals['tn'],$entry['run_id']]);

    audit_log($u['user_id'], 'entry_adjust', "Entry #$entryId adjusted — net: $net RWF", 'payroll');
    json_ok(['net_pay' => $net, 'gross' => $gross]);
}

/* ════════════════════════════════════════════
   PAYSLIPS
════════════════════════════════════════════ */
function action_payslip_list(): never {
    require_method('GET');
    $u    = auth_user();
    $role = $u['role'];

    if ($role === 'EMPLOYEE') {
        $uid = $u['user_id'];
    } else {
        $uid = i($_GET['user_id'] ?? 0);
    }

    $sql    = "SELECT pe.*, r.period_label, r.period_start, r.period_end, r.status AS run_status
               FROM payroll_entries pe JOIN payroll_runs r ON r.id=pe.run_id";
    $params = [];
    if ($uid) { $sql .= ' WHERE pe.user_id=?'; $params[] = $uid; }
    $sql .= ' ORDER BY r.period_start DESC LIMIT 36';

    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    json_ok($stmt->fetchAll());
}

function action_payslip_get(): never {
    require_method('GET');
    $u       = auth_user();
    $entryId = i($_GET['entry_id'] ?? 0);
    if (!$entryId) json_error('entry_id required');

    $stmt = db()->prepare("
        SELECT pe.*, r.period_label, r.period_start, r.period_end, r.status AS run_status,
               u.full_name, u.email, u.employee_id, u.department
        FROM payroll_entries pe
        JOIN payroll_runs r ON r.id=pe.run_id
        JOIN users u ON u.id=pe.user_id
        WHERE pe.id=? LIMIT 1
    ");
    $stmt->execute([$entryId]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    if ($u['role'] === 'EMPLOYEE' && $row['user_id'] != $u['user_id']) json_error('Forbidden', 403);
    json_ok($row);
}

function action_payslip_send(): never {
    require_method('POST');
    $u       = auth_user(['FINANCE','HR','IT_ADMIN']);
    $entryId = i(body()['entry_id'] ?? 0);
    if (!$entryId) json_error('entry_id required');

    $stmt = db()->prepare("
        SELECT pe.*, r.period_label, r.period_start, r.period_end,
               u.full_name, u.email, u.employee_id, u.department
        FROM payroll_entries pe
        JOIN payroll_runs r ON r.id=pe.run_id
        JOIN users u ON u.id=pe.user_id
        WHERE pe.id=? LIMIT 1
    ");
    $stmt->execute([$entryId]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    if (!$row['email']) json_error('Employee has no email');

    send_payslip_email($row, get_run($row['run_id']));
    audit_log($u['user_id'], 'payslip_send', "Payslip resent to {$row['email']}", 'payroll');
    json_ok('Payslip email sent');
}

function action_payslip_pdf(): never {
    $u       = auth_user();
    $entryId = i($_GET['entry_id'] ?? 0);
    if (!$entryId) { http_response_code(400); exit('entry_id required'); }

    $stmt = db()->prepare("
        SELECT pe.*, r.period_label, r.period_start, r.period_end,
               u.full_name, u.email, u.employee_id, u.department
        FROM payroll_entries pe
        JOIN payroll_runs r ON r.id=pe.run_id
        JOIN users u ON u.id=pe.user_id
        WHERE pe.id=? LIMIT 1
    ");
    $stmt->execute([$entryId]);
    $row = $stmt->fetch();
    if (!$row)                                                          { http_response_code(404); exit('Not found'); }
    if ($u['role'] === 'EMPLOYEE' && $row['user_id'] != $u['user_id']) { http_response_code(403); exit('Forbidden'); }

    header('Content-Type: text/html; charset=UTF-8');
    echo build_payslip_html($row, [
        'period_label' => $row['period_label'],
        'period_start' => $row['period_start'],
        'period_end'   => $row['period_end'],
    ], true);
    exit;
}

/* ════════════════════════════════════════════
   COMPLAINTS
════════════════════════════════════════════ */
function action_complaint_list(): never {
    require_method('GET');
    $u = auth_user();

    if ($u['role'] === 'EMPLOYEE') {
        $stmt = db()->prepare("
            SELECT c.*, r.period_label FROM payslip_complaints c
            JOIN payroll_entries pe ON pe.id=c.entry_id
            JOIN payroll_runs r ON r.id=pe.run_id
            WHERE c.user_id=? ORDER BY c.created_at DESC
        ");
        $stmt->execute([$u['user_id']]);
    } else {
        auth_user(['FINANCE','HR','IT_ADMIN']);
        $stmt = db()->query("
            SELECT c.*, u.full_name, u.email, r.period_label
            FROM payslip_complaints c
            JOIN users u ON u.id=c.user_id
            JOIN payroll_entries pe ON pe.id=c.entry_id
            JOIN payroll_runs r ON r.id=pe.run_id
            ORDER BY c.created_at DESC LIMIT 100
        ");
    }
    json_ok($stmt->fetchAll());
}

function action_complaint_add(): never {
    require_method('POST');
    $u       = auth_user();
    $b       = body();
    $entryId = i($b['entry_id'] ?? 0);
    $subject = trim($b['subject'] ?? '');
    $message = trim($b['message'] ?? '');
    if (!$entryId || !$subject || !$message) json_error('entry_id, subject, message required');

    if ($u['role'] === 'EMPLOYEE') {
        $chk = db()->prepare('SELECT id FROM payroll_entries WHERE id=? AND user_id=? LIMIT 1');
        $chk->execute([$entryId, $u['user_id']]);
        if (!$chk->fetch()) json_error('Forbidden', 403);
    }

    db()->prepare("INSERT INTO payslip_complaints (entry_id,user_id,subject,message) VALUES (?,?,?,?)")
        ->execute([$entryId, $u['user_id'], $subject, $message]);
    json_ok(['complaint_id' => (int)db()->lastInsertId()], 201);
}

function action_complaint_reply(): never {
    require_method('POST');
    $u  = auth_user(['FINANCE','HR','IT_ADMIN']);
    $b  = body();
    $id = i($b['complaint_id'] ?? 0);
    if (!$id || !trim($b['reply'] ?? '')) json_error('complaint_id and reply required');
    db()->prepare("UPDATE payslip_complaints SET reply=?,replied_by=?,status='in_review' WHERE id=?")
        ->execute([trim($b['reply']), $u['user_id'], $id]);
    json_ok('Reply sent');
}

function action_complaint_resolve(): never {
    require_method('POST');
    $u  = auth_user(['FINANCE','HR','IT_ADMIN']);
    $id = i(body()['complaint_id'] ?? 0);
    if (!$id) json_error('complaint_id required');
    db()->prepare("UPDATE payslip_complaints SET status='resolved',resolved_at=NOW() WHERE id=?")
        ->execute([$id]);
    audit_log($u['user_id'], 'complaint_resolve', "Complaint #$id resolved", 'payroll');
    json_ok('Resolved');
}

/* ════════════════════════════════════════════
   DASHBOARD STATS
════════════════════════════════════════════ */
function action_dashboard_stats(): never {
    require_method('GET');
    auth_user(['FINANCE','HR','IT_ADMIN']);
    $pdo            = db();
    $latestRun      = $pdo->query("SELECT * FROM payroll_runs ORDER BY period_start DESC LIMIT 1")->fetch();
    $totalEmployees = $pdo->query("SELECT COUNT(*) FROM salary_configs")->fetchColumn();
    $totalRuns      = $pdo->query("SELECT COUNT(*) FROM payroll_runs")->fetchColumn();
    $openComplaints = $pdo->query("SELECT COUNT(*) FROM payslip_complaints WHERE status!='resolved'")->fetchColumn();
    $ytdNet         = $pdo->query("SELECT COALESCE(SUM(total_net),0) FROM payroll_runs WHERE status='paid' AND YEAR(period_start)=YEAR(CURDATE())")->fetchColumn();
    $trend          = $pdo->query("SELECT period_label,total_gross,total_net,total_deductions FROM payroll_runs WHERE status='paid' ORDER BY period_start DESC LIMIT 6")->fetchAll();
    json_ok([
        'latest_run'      => $latestRun ?: null,
        'total_employees' => (int)$totalEmployees,
        'total_runs'      => (int)$totalRuns,
        'open_complaints' => (int)$openComplaints,
        'ytd_net_pay'     => (float)$ytdNet,
        'monthly_trend'   => array_reverse($trend),
    ]);
}

/* ════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════ */
function get_run(int $id): array|false {
    $s = db()->prepare('SELECT * FROM payroll_runs WHERE id=? LIMIT 1');
    $s->execute([$id]);
    return $s->fetch();
}

function get_template_rate(array $templates, string $name, float $default): float {
    foreach ($templates as $t) {
        if (stripos($t['name'], $name) !== false && $t['type'] === 'percentage') {
            return (float)$t['value'];
        }
    }
    return $default;
}

function fmt_rwf(float $amount): string {
    return 'RWF ' . number_format($amount, 0, '.', ',');
}

function build_payslip_html(array $entry, array $run, bool $standalone = false): string {
    $ded = is_string($entry['deduction_details'])
        ? (json_decode($entry['deduction_details'], true) ?? [])
        : ($entry['deduction_details'] ?? []);

    $deductionRows = '';
    foreach (($ded ?: []) as $d) {
        $deductionRows .= '<tr>
            <td style="padding:6px 12px;color:#64748b;font-size:12px">' . htmlspecialchars($d['name']) . '</td>
            <td style="padding:6px 12px;color:#64748b;font-size:11px">' . ($d['rate'] > 0 ? $d['rate'] . '%' : '—') . '</td>
            <td style="padding:6px 12px;color:#ef4444;font-size:12px;font-weight:600;text-align:right">' . fmt_rwf((float)$d['amount']) . '</td>
        </tr>';
    }

    $ovtRow   = (float)($entry['overtime_hours'] ?? 0) > 0
        ? '<tr><td style="padding:8px 12px;font-size:13px;color:#374151">Overtime (' . $entry['overtime_hours'] . ' hrs)</td><td style="padding:8px 12px;font-weight:600;color:#10b981;text-align:right">' . fmt_rwf((float)$entry['overtime_amount']) . '</td></tr>'
        : '';
    $bonusRow = (float)($entry['bonus'] ?? 0) > 0
        ? '<tr style="background:#f8fafc"><td style="padding:8px 12px;font-size:13px;color:#374151">Bonus</td><td style="padding:8px 12px;font-weight:600;color:#10b981;text-align:right">' . fmt_rwf((float)$entry['bonus']) . '</td></tr>'
        : '';

    $pl    = htmlspecialchars($run['period_label'] ?? '');
    $range = htmlspecialchars(($run['period_start'] ?? '') . ' → ' . ($run['period_end'] ?? ''));
    $nm    = htmlspecialchars($entry['full_name'] ?? '');
    $eid   = htmlspecialchars($entry['employee_id'] ?? '');
    $dept  = htmlspecialchars($entry['department'] ?? '');
    $yr    = date('Y');

    $head = $standalone ? '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Payslip ' . $pl . '</title></head><body style="margin:0;padding:20px;background:#f8fafc;font-family:Inter,sans-serif">' : '';
    $foot = $standalone ? '</body></html>' : '';

    return $head . '
<div style="max-width:620px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
  <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 32px;color:white">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
      <div>
        <div style="font-size:10px;font-weight:700;letter-spacing:2px;opacity:0.8;text-transform:uppercase">StaffSync · DevX Ltd</div>
        <div style="font-size:22px;font-weight:800;margin-top:6px">PAYSLIP</div>
        <div style="font-size:14px;opacity:0.85;margin-top:2px">' . $pl . '</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:11px;opacity:0.7">Period</div>
        <div style="font-size:12px;font-weight:600">' . $range . '</div>
      </div>
    </div>
  </div>
  <div style="padding:20px 32px;background:#f8fafc;border-bottom:1px solid #e2e8f0">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div><div style="font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase">Employee</div><div style="font-size:14px;font-weight:700;color:#1e293b;margin-top:2px">' . $nm . '</div></div>
      <div><div style="font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase">Employee ID</div><div style="font-size:14px;font-weight:700;color:#1e293b;margin-top:2px">' . $eid . '</div></div>
      <div><div style="font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase">Department</div><div style="font-size:13px;color:#475569;margin-top:2px">' . $dept . '</div></div>
      <div><div style="font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase">Currency</div><div style="font-size:13px;color:#475569;margin-top:2px">RWF (Rwandan Franc)</div></div>
    </div>
  </div>
  <div style="padding:20px 32px">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#94a3b8;letter-spacing:1px;margin-bottom:10px">Earnings</div>
    <table style="width:100%;border-collapse:collapse">
      <tr style="background:#f8fafc"><td style="padding:8px 12px;font-size:13px;color:#374151">Basic Salary</td><td style="padding:8px 12px;font-weight:700;color:#10b981;text-align:right">' . fmt_rwf((float)$entry['basic_salary']) . '</td></tr>
      ' . $ovtRow . $bonusRow . '
      <tr style="border-top:2px solid #e2e8f0">
        <td style="padding:10px 12px;font-size:14px;font-weight:700;color:#1e293b">GROSS PAY</td>
        <td style="padding:10px 12px;font-size:15px;font-weight:800;color:#10b981;text-align:right">' . fmt_rwf((float)$entry['gross']) . '</td>
      </tr>
    </table>
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#94a3b8;letter-spacing:1px;margin:18px 0 10px">Deductions</div>
    <table style="width:100%;border-collapse:collapse">
      <tr style="background:#fef2f2">
        <th style="padding:6px 12px;font-size:10px;color:#94a3b8;text-align:left;font-weight:600">ITEM</th>
        <th style="padding:6px 12px;font-size:10px;color:#94a3b8;text-align:left;font-weight:600">RATE</th>
        <th style="padding:6px 12px;font-size:10px;color:#94a3b8;text-align:right;font-weight:600">AMOUNT</th>
      </tr>
      ' . $deductionRows . '
      <tr style="border-top:2px solid #fecaca">
        <td colspan="2" style="padding:10px 12px;font-size:14px;font-weight:700;color:#1e293b">TOTAL DEDUCTIONS</td>
        <td style="padding:10px 12px;font-size:15px;font-weight:800;color:#ef4444;text-align:right">' . fmt_rwf((float)$entry['total_deductions']) . '</td>
      </tr>
    </table>
    <div style="margin-top:20px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:12px;padding:20px 24px;display:flex;justify-content:space-between;align-items:center">
      <div style="color:rgba(255,255,255,0.85);font-size:14px;font-weight:600">NET PAY</div>
      <div style="color:white;font-size:24px;font-weight:900">' . fmt_rwf((float)$entry['net_pay']) . '</div>
    </div>
  </div>
  <div style="padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:10px">
    Computer-generated payslip. For disputes contact Finance. · StaffSync © DevX Ltd ' . $yr . '
  </div>
</div>
' . $foot;
}

function send_payslip_email(array $entry, array $run): void {
    $ded = is_string($entry['deduction_details'])
        ? (json_decode($entry['deduction_details'], true) ?? [])
        : ($entry['deduction_details'] ?? []);

    $dedRows = '';
    foreach (($ded ?: []) as $d) {
        $dedRows .= '<tr style="background:rgba(99,102,241,0.04)">
            <td style="padding:8px 16px;color:#64748b;font-size:12px">' . htmlspecialchars($d['name']) . '</td>
            <td style="padding:8px 16px;color:#64748b;font-size:11px">' . ($d['rate'] > 0 ? $d['rate'] . '%' : '—') . '</td>
            <td style="padding:8px 16px;color:#ef4444;font-size:12px;font-weight:700;text-align:right">' . fmt_rwf((float)$d['amount']) . '</td>
        </tr>';
    }

    $pl      = htmlspecialchars($run['period_label'] ?? '');
    $nm      = htmlspecialchars($entry['full_name'] ?? '');
    $eid     = htmlspecialchars($entry['employee_id'] ?? '');
    $basic   = fmt_rwf((float)$entry['basic_salary']);
    $gross   = fmt_rwf((float)$entry['gross']);
    $totalD  = fmt_rwf((float)$entry['total_deductions']);
    $net     = fmt_rwf((float)$entry['net_pay']);
    $eid_int = (int)($entry['id'] ?? 0);
    $baseUrl = defined('APP_URL') ? APP_URL : 'http://localhost/staff_cecile';
    $pdfUrl  = $baseUrl . "/api/payroll.php?action=payslip_pdf&entry_id={$eid_int}";

    $html = '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0d1117;font-family:Inter,sans-serif">
<div style="max-width:620px;margin:40px auto;background:#111827;border-radius:16px;overflow:hidden;border:1px solid rgba(99,102,241,0.2)">
  <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 32px;color:white">
    <div style="font-size:10px;font-weight:700;letter-spacing:2px;opacity:0.8;text-transform:uppercase">StaffSync · DevX Ltd</div>
    <div style="font-size:22px;font-weight:800;margin-top:6px">Your Payslip is Ready</div>
    <div style="font-size:14px;opacity:0.85;margin-top:2px">' . $pl . '</div>
  </div>
  <div style="padding:24px 32px">
    <p style="color:#cbd5e1;font-size:14px;margin:0 0 20px">Hi <strong style="color:#e2e8f0">' . $nm . '</strong>, your payslip for <strong style="color:#818cf8">' . $pl . '</strong> is ready.</p>
    <div style="background:rgba(26,34,54,0.6);border:1px solid rgba(99,102,241,0.15);border-radius:12px;overflow:hidden;margin-bottom:20px">
      <div style="padding:12px 16px;background:rgba(99,102,241,0.08);border-bottom:1px solid rgba(99,102,241,0.12)">
        <span style="font-size:11px;font-weight:700;color:#818cf8;text-transform:uppercase;letter-spacing:1px">Summary</span>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:10px 16px;color:#64748b;font-size:12px">Employee</td><td style="padding:10px 16px;color:#e2e8f0;font-size:13px;font-weight:600;text-align:right">' . $nm . ' (' . $eid . ')</td></tr>
        <tr><td style="padding:8px 16px;color:#64748b;font-size:12px">Basic Salary</td><td style="padding:8px 16px;color:#10b981;font-size:13px;font-weight:700;text-align:right">' . $basic . '</td></tr>
        <tr><td style="padding:8px 16px;color:#64748b;font-size:12px">Gross Pay</td><td style="padding:8px 16px;color:#10b981;font-size:13px;font-weight:700;text-align:right">' . $gross . '</td></tr>
        ' . $dedRows . '
        <tr><td style="padding:8px 16px;color:#64748b;font-size:12px">Total Deductions</td><td style="padding:8px 16px;color:#ef4444;font-size:13px;font-weight:700;text-align:right">' . $totalD . '</td></tr>
        <tr style="border-top:2px solid rgba(99,102,241,0.2)">
          <td style="padding:12px 16px;color:#e2e8f0;font-size:14px;font-weight:800">NET PAY</td>
          <td style="padding:12px 16px;color:#818cf8;font-size:18px;font-weight:900;text-align:right">' . $net . '</td>
        </tr>
      </table>
    </div>
    <p style="color:#94a3b8;font-size:12px;margin:0 0 16px">Questions? Raise a complaint through the employee portal.</p>
    <a href="' . $pdfUrl . '" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:13px;font-weight:600">View Full Payslip</a>
  </div>
  <div style="padding:16px 32px;border-top:1px solid rgba(99,102,241,0.1);text-align:center">
    <p style="margin:0;color:#475569;font-size:11px">StaffSync · DevX Ltd · Automated payroll notification</p>
  </div>
</div></body></html>';

    send_mail($entry['email'], $entry['full_name'], "Payslip — $pl", $html);
}
