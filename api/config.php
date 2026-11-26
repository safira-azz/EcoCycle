<?php
// ═══════════════════════════════════════════════════════
// EcoCycle Backend Config
// ═══════════════════════════════════════════════════════

define('DB_HOST',        '127.0.0.1');
define('DB_PORT',        '3306');
define('DB_NAME',        'sampah');      // ← nama database di XAMPP
define('DB_USER',        'root');
define('DB_PASS',        '');
define('APP_URL',        'http://localhost/sampah');
define('UPLOAD_PATH',    dirname(__DIR__) . '/uploads/');
define('JWT_SECRET',     'ecocycle_jwt_secret_v2_change_in_production_2024');
define('SIMULATION_MODE', true);
define('DEV_MODE',        true);   // tampilkan error detail saat development

// ── CORS ──────────────────────────────────────────────────
// Allow semua origin di localhost (XAMPP dev)
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
$allowedOrigins = [
    'http://localhost',
    'http://localhost:80',
    'http://127.0.0.1',
    'http://127.0.0.1:80',
];
// Allow jika origin mengandung localhost / 127.0.0.1
$isLocalhost = preg_match('#^https?://(localhost|127\.0\.0\.1)(:\d+)?$#', $origin);
$corsOrigin = $isLocalhost ? $origin : 'http://localhost';

header('Access-Control-Allow-Origin: '   . $corsOrigin);
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Device-Key, X-Device-Id');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── RESPONSE HELPERS (harus didefinisikan SEBELUM getDB) ──
function jsonOk($data = [], string $message = 'Success', int $code = 200): void {
    http_response_code($code);
    echo json_encode(['success' => true, 'message' => $message, 'data' => $data],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function jsonError(string $message, int $code = 400, array $errors = []): void {
    http_response_code($code);
    $body = ['success' => false, 'message' => $message];
    if ($errors) $body['errors'] = $errors;
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// Legacy alias
function jsonResponse($data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// ── DATABASE ──────────────────────────────────────────────
$_pdo = null;

function getDB(): PDO {
    global $_pdo;
    if ($_pdo !== null) return $_pdo;

    try {
        $dsn = sprintf(
            'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
            DB_HOST, DB_PORT, DB_NAME
        );
        $_pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::ATTR_TIMEOUT            => 5,
        ]);
        return $_pdo;

    } catch (PDOException $e) {
        $detail = DEV_MODE
            ? ' Detail: ' . $e->getMessage()
            : ' Pastikan MySQL XAMPP menyala dan database "ecocycle" sudah diimport.';
        jsonError(
            'Database connection failed.' . $detail .
            ' Host: ' . DB_HOST . ' | DB: ' . DB_NAME,
            500
        );
    }
}

// ── DB CONNECTION TEST (tanpa auth) ───────────────────────
// Dipanggil jika action=db-test dari file manapun
function handleDbTest(): void {
    // Test 1: apakah MySQL bisa dihubungi sama sekali
    try {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';charset=utf8mb4',
            DB_USER, DB_PASS,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 5]
        );
    } catch (PDOException $e) {
        jsonOk([
            'connected'   => false,
            'database'    => DB_NAME,
            'stage'       => 'mysql_connection',
            'error'       => $e->getMessage(),
            'fix'         => 'Buka XAMPP Control Panel dan pastikan MySQL service sudah START (hijau).',
            'host'        => DB_HOST,
            'port'        => DB_PORT,
        ], 'MySQL tidak dapat dihubungi', 200);
    }

    // Test 2: apakah database ecocycle ada
    $stmt = $pdo->query("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = '" . DB_NAME . "'");
    if (!$stmt->fetch()) {
        jsonOk([
            'connected'    => false,
            'database'     => DB_NAME,
            'stage'        => 'database_exists',
            'error'        => "Database '" . DB_NAME . "' tidak ditemukan.",
            'fix'          => 'Buka http://localhost/phpmyadmin → Import → pilih file db/ecocycle.sql → klik Go.',
            'phpmyadmin'   => 'http://localhost/phpmyadmin',
            'sql_file'     => 'c:/xampp/htdocs/sampah/db/ecocycle.sql',
        ], 'Database ecocycle belum ada', 200);
    }

    // Test 3: apakah tabel utama ada
    $pdo->exec('USE ' . DB_NAME);
    $requiredTables = ['users','waste_categories','waste_scans','ai_predictions','iot_devices','system_settings'];
    $missing = [];
    foreach ($requiredTables as $tbl) {
        $r = $pdo->query("SHOW TABLES LIKE '$tbl'")->fetch();
        if (!$r) $missing[] = $tbl;
    }
    if ($missing) {
        jsonOk([
            'connected'     => false,
            'database'      => DB_NAME,
            'stage'         => 'tables_exist',
            'missing_tables'=> $missing,
            'error'         => 'Beberapa tabel belum ada.',
            'fix'           => 'Import ulang db/ecocycle.sql melalui phpMyAdmin.',
        ], 'Tabel database tidak lengkap', 200);
    }

    // Test 4: hitung baris seed data
    $userCount = (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
    $catCount  = (int)$pdo->query('SELECT COUNT(*) FROM waste_categories')->fetchColumn();

    jsonOk([
        'connected'   => true,
        'database'    => DB_NAME,
        'host'        => DB_HOST,
        'port'        => DB_PORT,
        'user'        => DB_USER,
        'tables_ok'   => true,
        'users'       => $userCount,
        'categories'  => $catCount,
        'php_version' => PHP_VERSION,
        'server'      => $_SERVER['SERVER_SOFTWARE'] ?? 'Apache/XAMPP',
    ], 'Database terhubung dengan baik');
}

// ── JWT AUTH ──────────────────────────────────────────────
function createToken(array $user): string {
    $header  = rtrim(base64_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT'])), '=');
    $payload = rtrim(base64_encode(json_encode([
        'id'    => (int)$user['id'],
        'email' => $user['email'],
        'role'  => $user['role'] ?? 'user',
        'exp'   => time() + 86400 * 7,
    ])), '=');
    $sig = hash_hmac('sha256', "$header.$payload", JWT_SECRET);
    return "$header.$payload.$sig";
}

function getAuthUser(): ?array {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    // Apache kadang tidak meneruskan Authorization; fallback ke $_SERVER
    if (empty($headers['Authorization']) && empty($headers['authorization'])) {
        $raw = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    } else {
        $raw = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    }
    $token = str_starts_with($raw, 'Bearer ') ? substr($raw, 7) : trim($raw);
    if (!$token) return null;

    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;

    $payload = json_decode(
        base64_decode(str_pad($parts[1], strlen($parts[1]) + (4 - strlen($parts[1]) % 4) % 4, '=')),
        true
    );
    if (!$payload || ($payload['exp'] ?? 0) < time()) return null;

    $expected = hash_hmac('sha256', $parts[0] . '.' . $parts[1], JWT_SECRET);
    if (!hash_equals($expected, $parts[2])) return null;

    return $payload;
}

function requireAuth(): array {
    $user = getAuthUser();
    if (!$user) jsonError('Unauthorized – silakan login kembali', 401);
    return $user;
}

function requireAdmin(): array {
    $user = requireAuth();
    if (($user['role'] ?? '') !== 'admin') jsonError('Forbidden – diperlukan akses admin', 403);
    return $user;
}

// ── IoT DEVICE AUTH ───────────────────────────────────────
function requireDeviceAuth(): array {
    $db      = getDB();
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $deviceId  = $headers['X-Device-Id']  ?? ($_SERVER['HTTP_X_DEVICE_ID']  ?? ($_POST['device_id']  ?? ''));
    $deviceKey = $headers['X-Device-Key'] ?? ($_SERVER['HTTP_X_DEVICE_KEY'] ?? ($_POST['device_key'] ?? ''));
    if (!$deviceId || !$deviceKey) jsonError('Device credentials required', 401);

    $stmt = $db->prepare('SELECT * FROM iot_devices WHERE device_id = ? AND device_key = SHA2(?,256) AND is_active = 1');
    $stmt->execute([$deviceId, $deviceKey]);
    $device = $stmt->fetch();
    if (!$device) jsonError('Invalid device credentials', 401);

    $db->prepare('UPDATE iot_devices SET status = "online", last_seen = NOW() WHERE device_id = ?')
       ->execute([$deviceId]);
    return $device;
}

// ── INPUT HELPERS ─────────────────────────────────────────
function body(): array {
    static $parsed = null;
    if ($parsed === null) {
        $raw    = file_get_contents('php://input');
        $parsed = $raw ? (json_decode($raw, true) ?? []) : [];
    }
    return $parsed;
}

function sanitize(string $val): string {
    return htmlspecialchars(strip_tags(trim($val)), ENT_QUOTES, 'UTF-8');
}

// ── LEVEL CALCULATOR ──────────────────────────────────────
function calcLevel(int $points): string {
    if ($points >= 5000) return 'Eco Champion';
    if ($points >= 2000) return 'Eco Expert';
    if ($points >= 1000) return 'Eco Warrior';
    if ($points >= 500)  return 'Eco Explorer';
    if ($points >= 100)  return 'Eco Learner';
    return 'Eco Starter';
}

// ── LOGGER ────────────────────────────────────────────────
function logAction(?int $userId, string $action, string $desc = ''): void {
    try {
        getDB()->prepare(
            'INSERT INTO system_logs (user_id, action, description, ip_address, user_agent) VALUES (?,?,?,?,?)'
        )->execute([
            $userId,
            $action,
            $desc,
            $_SERVER['REMOTE_ADDR']     ?? '',
            $_SERVER['HTTP_USER_AGENT'] ?? '',
        ]);
    } catch (Throwable $e) {
        // Logging gagal tidak boleh menghentikan request
    }
}

// ── HANDLE db-test dari file manapun ─────────────────────
$_action = $_GET['action'] ?? '';
if ($_action === 'db-test') {
    handleDbTest();
}
