<?php
require_once __DIR__ . '/config.php';

$sqls = [
"CREATE TABLE IF NOT EXISTS gps_heartbeats (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED NOT NULL,
  attendance_id INT UNSIGNED NULL,
  lat           DECIMAL(10,7) NOT NULL,
  lng           DECIMAL(10,7) NOT NULL,
  accuracy_m    SMALLINT UNSIGNED NULL,
  zone_id       INT UNSIGNED NULL,
  distance_m    INT NULL,
  inside_zone   TINYINT(1) NOT NULL DEFAULT 0,
  status        ENUM('OK','OUT_OF_ZONE','NO_ZONE') NOT NULL DEFAULT 'OK',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_time (user_id, created_at),
  INDEX idx_attendance (attendance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

"CREATE TABLE IF NOT EXISTS presence_status (
  user_id        INT UNSIGNED PRIMARY KEY,
  attendance_id  INT UNSIGNED NULL,
  zone_id        INT UNSIGNED NULL,
  last_heartbeat DATETIME NULL,
  last_lat       DECIMAL(10,7) NULL,
  last_lng       DECIMAL(10,7) NULL,
  last_dist_m    INT NULL,
  inside_zone    TINYINT(1) NOT NULL DEFAULT 0,
  status         ENUM('CHECKED_IN','OUT_OF_ZONE','INACTIVE_SIGNAL','PRESENCE_DOUBT','EXEMPT','CHECKED_OUT') NOT NULL DEFAULT 'CHECKED_OUT',
  exempt_reason  VARCHAR(200) NULL,
  flagged_at     DATETIME NULL,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
];

$results = [];
foreach ($sqls as $sql) {
    try {
        db()->exec($sql);
        $results[] = ['ok' => true, 'sql' => substr($sql, 0, 60)];
    } catch (PDOException $e) {
        $results[] = ['ok' => false, 'sql' => substr($sql, 0, 60), 'err' => $e->getMessage()];
    }
}

json_ok($results);
