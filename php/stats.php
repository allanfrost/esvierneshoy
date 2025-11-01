<?php
declare(strict_types=1);

/**
 * Endpoint til opsamling af besøg. Placer filen (sammen med config.php)
 * i roden af dit Simply.com-webhotel, så den svarer på
 * https://ditdomæne.tld/stats.php
 */

require __DIR__ . '/config.php';

header('Access-Control-Allow-Origin: ' . ALLOWED_ORIGIN);
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Max-Age: 86400');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST, OPTIONS');
    exit();
}

$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);

if (!is_array($data)) {
    http_response_code(400);
    echo 'JSON invalido.';
    exit();
}

$timezone = isset($data['timezone']) && is_string($data['timezone']) ? substr($data['timezone'], 0, 100) : null;
$isFriday = isset($data['isFriday']) ? (int) ((bool) $data['isFriday']) : null;
$forcedMode = isset($data['forcedMode']) && in_array($data['forcedMode'], ['friday', 'no'], true) ? $data['forcedMode'] : null;
$season = isset($data['season']) && is_string($data['season']) ? substr($data['season'], 0, 30) : null;
$generatedAtIso = isset($data['generatedAt']) && is_string($data['generatedAt']) ? $data['generatedAt'] : null;

$generatedAt = null;
if ($generatedAtIso !== null) {
    $dt = DateTime::createFromFormat(DateTime::ATOM, $generatedAtIso);
    if ($dt instanceof DateTime) {
        $generatedAt = $dt->format('Y-m-d H:i:s');
    }
}

$visitorIp = $_SERVER['REMOTE_ADDR'] ?? null;
$userAgent = $_SERVER['HTTP_USER_AGENT'] ?? null;

$mysqli = @new mysqli(DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT);
if ($mysqli->connect_errno) {
    error_log('Stats DB connect error: ' . $mysqli->connect_error);
    http_response_code(500);
    echo 'Error en el servidor.';
    exit();
}

$mysqli->set_charset('utf8mb4');

$createTableSql = <<<SQL
CREATE TABLE IF NOT EXISTS visit_logs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  timezone VARCHAR(100) NULL,
  is_friday TINYINT(1) NULL,
  forced_mode ENUM('friday', 'no') NULL,
  season VARCHAR(30) NULL,
  generated_at DATETIME NULL,
  remote_addr VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_created_at (created_at),
  KEY idx_timezone (timezone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SQL;

if (!$mysqli->query($createTableSql)) {
    error_log('Stats DB table creation error: ' . $mysqli->error);
    http_response_code(500);
    echo 'Error en el servidor.';
    exit();
}

$stmt = $mysqli->prepare(
    'INSERT INTO visit_logs (timezone, is_friday, forced_mode, season, generated_at, remote_addr, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)'
);

if (!$stmt) {
    error_log('Stats DB prepare error: ' . $mysqli->error);
    http_response_code(500);
    echo 'Error en el servidor.';
    exit();
}

$stmt->bind_param(
    'sisssss',
    $timezone,
    $isFriday,
    $forcedMode,
    $season,
    $generatedAt,
    $visitorIp,
    $userAgent
);

if (!$stmt->execute()) {
    error_log('Stats DB execute error: ' . $stmt->error);
    http_response_code(500);
    echo 'Error en el servidor.';
    exit();
}

$stmt->close();
$mysqli->close();

http_response_code(204);
