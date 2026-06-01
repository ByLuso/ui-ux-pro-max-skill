<?php
// ── CONFIGURA ESTOS DATOS CON LOS DE TU HOSTINGER ────────────────────────────
// Los encuentras en hPanel → Bases de datos → MySQL → Ver detalles
define('DB_HOST', 'localhost');
define('DB_NAME', 'TU_NOMBRE_DB');      // ej: u123456789_routlo
define('DB_USER', 'TU_USUARIO_DB');     // ej: u123456789_admin
define('DB_PASS', 'TU_PASSWORD_DB');
// ─────────────────────────────────────────────────────────────────────────────

define('ALLOWED_ORIGIN', 'https://routlo.com');

header('Access-Control-Allow-Origin: ' . ALLOWED_ORIGIN);
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

// Pre-flight CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER, DB_PASS,
            [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]
        );
    }
    return $pdo;
}

function respond(array $data, int $code = 200): never {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function body(): array {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}

function auth_user(): int {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    $token  = str_replace('Bearer ', '', $header);
    if (!$token) respond(['error' => 'No autorizado'], 401);

    $stmt = db()->prepare(
        'SELECT user_id FROM sessions WHERE id = ? AND expires_at > NOW()'
    );
    $stmt->execute([$token]);
    $row = $stmt->fetch();
    if (!$row) respond(['error' => 'Sesión expirada'], 401);
    return (int) $row['user_id'];
}
