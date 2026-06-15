<?php
/**
 * StaffSync — migrate_finance.php
 * Run once: http://localhost/staff_cecile/api/migrate_finance.php
 *
 * Adds FINANCE to the users.role ENUM and creates payroll tables.
 */
require_once __DIR__ . '/config.php';

$pdo  = db();
$log  = [];
$ok   = true;

function run(PDO $pdo, string $label, string $sql, array &$log, bool &$ok): void {
    try {
        $pdo->exec($sql);
        $log[] = "✅ $label";
    } catch (PDOException $e) {
        $log[] = "❌ $label — " . $e->getMessage();
        $ok    = false;
    }
}

/* 1. Add FINANCE to the role ENUM */
run($pdo, 'Add FINANCE to users.role ENUM', "
    ALTER TABLE users
    MODIFY COLUMN role ENUM('EMPLOYEE','MANAGER','HR','IT_ADMIN','FINANCE','SYSTEM')
    NOT NULL DEFAULT 'EMPLOYEE'
", $log, $ok);

/* 2. salary_configs */
run($pdo, 'Create salary_configs', "
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
", $log, $ok);

/* 3. deduction_templates */
run($pdo, 'Create deduction_templates', "
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
", $log, $ok);

/* 4. payroll_runs */
run($pdo, 'Create payroll_runs', "
    CREATE TABLE IF NOT EXISTS payroll_runs (
        id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        period_label     VARCHAR(30)  NOT NULL,
        period_start     DATE         NOT NULL,
        period_end       DATE         NOT NULL,
        status           ENUM('draft','processing','pending_manager','pending_hr','approved','rejected','paid') NOT NULL DEFAULT 'draft',
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
", $log, $ok);

/* 5. payroll_entries */
run($pdo, 'Create payroll_entries', "
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
", $log, $ok);

/* 6. payslip_complaints */
run($pdo, 'Create payslip_complaints', "
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
", $log, $ok);

/* Output */
header('Content-Type: text/html; charset=UTF-8');
echo '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Finance Migration</title>';
echo '<style>body{font-family:monospace;background:#0d1117;color:#e2e8f0;padding:30px;max-width:700px;margin:0 auto}h1{color:#818cf8}li{margin:6px 0;font-size:14px}.ok{color:#34d399}.fail{color:#f87171}</style>';
echo '</head><body>';
echo '<h1>StaffSync — Finance Migration</h1><ul>';
foreach ($log as $line) {
    $cls = str_contains($line, '✅') ? 'ok' : 'fail';
    echo "<li class=\"$cls\">" . htmlspecialchars($line) . '</li>';
}
echo '</ul>';
if ($ok) {
    echo '<p style="color:#34d399;font-weight:bold;margin-top:20px">✅ All migrations completed successfully!</p>';
    echo '<p style="color:#94a3b8;font-size:13px">You can now create a Finance user via HR → Users → Change Role → Finance.</p>';
} else {
    echo '<p style="color:#f87171;font-weight:bold;margin-top:20px">⚠️ Some migrations failed. Check errors above.</p>';
}
echo '</body></html>';
