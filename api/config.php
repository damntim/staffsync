<?php
/**
 * StaffSync — Global config, DB connection, JWT helpers, CORS, response utils
 */

/* ── Composer autoloader ── */
if (file_exists(__DIR__ . '/../vendor/autoload.php')) {
    require_once __DIR__ . '/../vendor/autoload.php';
}

/* ── Mail config (fill in api/mail_config.php) ── */
if (file_exists(__DIR__ . '/mail_config.php')) {
    require_once __DIR__ . '/mail_config.php';
}

/* ── Environment ── */
define('APP_ENV', getenv('APP_ENV') ?: 'production');
define('APP_NAME', 'StaffSync');

// Derive base URL from the current request so the app works on any host.
// In dev the Vite proxy sends requests through localhost; in production the
// React build is served from the same origin as the API.
(function () {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host   = $_SERVER['HTTP_HOST'] ?? 'localhost';

    // Walk up from /api/<file>.php to find the project root.
    // __DIR__ is  …/staff_cecile/api  →  parent is  …/staff_cecile
    $scriptPath = str_replace('\\', '/', __DIR__);
    $docRoot    = str_replace('\\', '/', $_SERVER['DOCUMENT_ROOT'] ?? '');
    $subPath    = $docRoot ? rtrim(str_replace($docRoot, '', dirname($scriptPath)), '/') : '';

    $appUrl      = $scheme . '://' . $host . $subPath;       // e.g. https://yourdomain.com or http://localhost/staff_cecile
    $frontendUrl = $appUrl;                                   // same origin in production; dev proxy makes this work locally too

    define('APP_URL',      $appUrl);
    define('FRONTEND_URL', $frontendUrl);
})();

/* ── Database ── */
define('DB_HOST', 'localhost');
define('DB_NAME', 'staffsync');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_CHARSET', 'utf8mb4');

/* ── JWT ── */
define('JWT_SECRET', 'STAFFSYNC_JWT_SECRET_CHANGE_IN_PROD_32CHARS!!');
define('JWT_EXPIRY', 28800);   // 8 hours in seconds

/* ── Face biometric encryption (AES-256-CBC) ── */
define('FACE_ENC_KEY', 'STAFFSYNC_FACE_KEY_32BYTES_CHANGE!!');
define('FACE_ENC_IV',  'STAFFSYNC_IV_16B');

/* ── QR tokens ── */
define('QR_ROTATE_SECONDS', 30);
define('QR_TOKEN_SECRET', 'STAFFSYNC_QR_SECRET_CHANGE_IN_PROD!!');

/* ── Invite expiry ── */
define('INVITE_EXPIRY_HOURS', 168);   // 7 days

/* ── File upload limits ── */
define('UPLOAD_MAX_MB', 5);
define('UPLOAD_DIR', __DIR__ . '/../uploads/');
define('QRCODE_DIR', __DIR__ . '/../qrcodes/');

/* ── CORS ── */
// In production the React build is served from the same origin, so no
// cross-origin requests happen. In local dev we also allow Vite ports.
$origin  = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = [
    'http://localhost:5173', 'http://localhost:4173', 'http://localhost',
    APP_URL,  // allow same-origin calls (e.g. when served from a sub-path)
];
if ($origin && (in_array($origin, $allowed, true) || parse_url($origin, PHP_URL_HOST) === ($_SERVER['HTTP_HOST'] ?? ''))) {
    header("Access-Control-Allow-Origin: $origin");
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

/* ── PDO singleton ── */
function db(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $dsn = sprintf('mysql:host=%s;dbname=%s;charset=%s', DB_HOST, DB_NAME, DB_CHARSET);
    try {
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    } catch (PDOException $e) {
        json_error('Database connection failed', 503);
    }
    return $pdo;
}

/* ── JSON response helpers ── */
function json_ok(mixed $data = null, int $code = 200): never {
    http_response_code($code);
    echo json_encode(['success' => true, 'data' => $data], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function json_error(string $message, int $code = 400, array $extra = []): never {
    http_response_code($code);
    echo json_encode(array_merge(['success' => false, 'error' => $message], $extra), JSON_UNESCAPED_UNICODE);
    exit;
}

function body(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) return $_POST;
    $parsed = json_decode($raw, true);
    return is_array($parsed) ? $parsed : [];
}

function require_method(string ...$methods): void {
    if (!in_array($_SERVER['REQUEST_METHOD'], $methods, true)) {
        json_error('Method not allowed', 405);
    }
}

/* ── JWT ── */
function jwt_encode(array $payload): string {
    $header  = base64url(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $payload['iat'] = time();
    $payload['exp'] = time() + JWT_EXPIRY;
    $pay     = base64url(json_encode($payload));
    $sig     = base64url(hash_hmac('sha256', "$header.$pay", JWT_SECRET, true));
    return "$header.$pay.$sig";
}

function jwt_decode(string $token): ?array {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;

    [$header, $payload, $sig] = $parts;
    $expected = base64url(hash_hmac('sha256', "$header.$payload", JWT_SECRET, true));
    if (!hash_equals($expected, $sig)) return null;

    $data = json_decode(base64url_decode($payload), true);
    if (!is_array($data)) return null;
    if (isset($data['exp']) && $data['exp'] < time()) return null;

    return $data;
}

function base64url(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64url_decode(string $data): string {
    return base64_decode(strtr($data, '-_', '+/'));
}

/* ── Auth guard ── */
function auth_user(array $allowed_roles = []): array {
    $header = $_SERVER['HTTP_AUTHORIZATION']
           ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
           ?? (function_exists('apache_request_headers') ? (apache_request_headers()['Authorization'] ?? '') : '');
    if (!str_starts_with($header, 'Bearer ')) {
        json_error('Unauthorized — missing token', 401);
    }
    $token   = substr($header, 7);
    $payload = jwt_decode($token);
    if (!$payload) {
        json_error('Unauthorized — invalid or expired token', 401);
    }

    // Verify token is in active_sessions table
    $stmt = db()->prepare('SELECT id FROM active_sessions WHERE token_hash = ? AND user_id = ? AND expires_at > NOW()');
    $stmt->execute([hash('sha256', $token), $payload['user_id']]);
    if (!$stmt->fetch()) {
        json_error('Unauthorized — session revoked', 401);
    }

    if ($allowed_roles && !in_array($payload['role'], $allowed_roles, true)) {
        json_error('Forbidden — insufficient role', 403);
    }

    return $payload;
}

/* ── Audit logger ── */
function audit_log(int $userId, string $action, string $detail, string $type = 'system', string $status = 'success'): void {
    try {
        $ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '—';
        $stmt = db()->prepare(
            'INSERT INTO audit_log (user_id, action_type, action, detail, ip_address, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())'
        );
        $stmt->execute([$userId, $type, $action, $detail, $ip, $status]);
    } catch (Throwable) { /* never let logging crash a request */ }
}

/* ── Face descriptor encryption ── */
function encrypt_face(string $json128d): string {
    $key = substr(hash('sha256', FACE_ENC_KEY, true), 0, 32);
    $iv  = substr(hash('sha256', FACE_ENC_IV, true), 0, 16);
    return base64_encode(openssl_encrypt($json128d, 'AES-256-CBC', $key, 0, $iv));
}

function decrypt_face(string $encrypted): string {
    $key = substr(hash('sha256', FACE_ENC_KEY, true), 0, 32);
    $iv  = substr(hash('sha256', FACE_ENC_IV, true), 0, 16);
    return openssl_decrypt(base64_decode($encrypted), 'AES-256-CBC', $key, 0, $iv);
}

/* ── Haversine geofence check ── */
function within_geofence(float $lat, float $lng, float $zoneLat, float $zoneLng, float $radiusMetres): bool {
    $earthR = 6371000;
    $dLat   = deg2rad($lat - $zoneLat);
    $dLng   = deg2rad($lng - $zoneLng);
    $a      = sin($dLat/2)**2 + cos(deg2rad($zoneLat)) * cos(deg2rad($lat)) * sin($dLng/2)**2;
    $dist   = $earthR * 2 * asin(sqrt($a));
    return $dist <= $radiusMetres;
}

/* ── Input sanitize ── */
function s(mixed $v): string { return htmlspecialchars((string) ($v ?? ''), ENT_QUOTES, 'UTF-8'); }
function i(mixed $v): int    { return (int) $v; }
function f(mixed $v): float  { return (float) $v; }

/* ── PHPMailer helper ── */
function send_mail(string $to, string $toName, string $subject, string $htmlBody, string $plainBody = ''): bool {
    /* Requires mail_config.php to be filled in */
    if (!defined('MAIL_USER') || MAIL_PASS === 'REPLACE_WITH_APP_PASSWORD') {
        /* Fall back to native mail() if SMTP not configured */
        @mail($to, $subject, $plainBody ?: strip_tags($htmlBody), "From: noreply@devx.com\r\nContent-Type: text/plain; charset=UTF-8");
        return false; // indicates fallback used
    }

    if (!class_exists(\PHPMailer\PHPMailer\PHPMailer::class)) {
        @mail($to, $subject, $plainBody ?: strip_tags($htmlBody), "From: " . MAIL_FROM_ADDR);
        return false;
    }

    try {
        $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
        $mail->isSMTP();
        $mail->Host       = MAIL_SMTP_HOST;
        $mail->SMTPAuth   = true;
        $mail->Username   = MAIL_USER;
        $mail->Password   = MAIL_PASS;
        $mail->SMTPSecure = MAIL_SMTP_SECURE;
        $mail->Port       = MAIL_SMTP_PORT;
        $mail->CharSet    = 'UTF-8';

        $mail->setFrom(MAIL_FROM_ADDR, MAIL_FROM_NAME);
        $mail->addAddress($to, $toName);
        $mail->addReplyTo(MAIL_FROM_ADDR, MAIL_FROM_NAME);

        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body    = $htmlBody;
        $mail->AltBody = $plainBody ?: strip_tags($htmlBody);

        $mail->send();
        return true;
    } catch (\Throwable $e) {
        error_log('[StaffSync mail] ' . $e->getMessage());
        return false;
    }
}
