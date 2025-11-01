<?php
declare(strict_types=1);

session_start();

require __DIR__ . '/../config.php';

function h(?string $value): string
{
    return htmlspecialchars($value ?? '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

$mysqli = @new mysqli(DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT);
if ($mysqli->connect_errno) {
    http_response_code(500);
    echo '<h1>Unable to connect to the database.</h1>';
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

$mysqli->query($createTableSql);

$createUsersSql = <<<SQL
CREATE TABLE IF NOT EXISTS stats_users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SQL;

$mysqli->query($createUsersSql);

$needsDefaultUser = false;
if ($result = $mysqli->query('SELECT COUNT(*) AS total FROM stats_users')) {
    $row = $result->fetch_assoc();
    $needsDefaultUser = isset($row['total']) && (int) $row['total'] === 0;
    $result->free();
}

if ($needsDefaultUser && defined('STATS_DEFAULT_USER') && STATS_DEFAULT_USER !== '' && defined('STATS_DEFAULT_PASSWORD') && STATS_DEFAULT_PASSWORD !== '') {
    $stmt = $mysqli->prepare('INSERT INTO stats_users (username, password_hash) VALUES (?, ?)');
    if ($stmt) {
        $hash = password_hash(STATS_DEFAULT_PASSWORD, PASSWORD_DEFAULT);
        $defaultUser = STATS_DEFAULT_USER;
        $hashCopy = $hash;
        $stmt->bind_param('ss', $defaultUser, $hashCopy);
        $stmt->execute();
        $stmt->close();
    }
}

$loginError = null;
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['username'], $_POST['password'])) {
    $username = trim((string) $_POST['username']);
    $password = (string) $_POST['password'];

    $stmt = $mysqli->prepare('SELECT id, password_hash FROM stats_users WHERE username = ?');
    if ($stmt) {
        $stmt->bind_param('s', $username);
        $stmt->execute();
        $stmt->bind_result($userId, $passwordHash);
        if ($stmt->fetch() && password_verify($password, $passwordHash)) {
            $_SESSION['stats_user_id'] = $userId;
            $_SESSION['stats_username'] = $username;
            header('Location: index.php');
            exit();
        }
        $loginError = 'Invalid username or password.';
        $stmt->close();
    } else {
        $loginError = 'Login unavailable.';
    }
}

if (isset($_GET['logout'])) {
    session_destroy();
    header('Location: index.php');
    exit();
}

if (!isset($_SESSION['stats_user_id'])) {
    ?>
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Statistics login - esvierneshoy.com</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: system-ui, -apple-system, Segoe UI, sans-serif;
        background: #0f172a;
        color: #e2e8f0;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem;
      }
      form {
        width: 100%;
        max-width: 360px;
        background: rgba(15, 23, 42, 0.75);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 12px;
        padding: 2rem;
        box-shadow: 0 18px 45px rgba(15, 23, 42, 0.45);
      }
      h1 {
        margin-top: 0;
        margin-bottom: 1.5rem;
        text-align: center;
      }
      label {
        display: block;
        font-size: 0.9rem;
        margin-bottom: 0.35rem;
      }
      input {
        width: 100%;
        padding: 0.65rem 0.75rem;
        margin-bottom: 1rem;
        border-radius: 8px;
        border: 1px solid rgba(148, 163, 184, 0.3);
        background: rgba(15, 23, 42, 0.4);
        color: inherit;
      }
      button {
        width: 100%;
        padding: 0.75rem;
        border: none;
        border-radius: 8px;
        background: linear-gradient(135deg, #22d3ee, #6366f1);
        color: #0f172a;
        font-weight: 600;
        cursor: pointer;
      }
      .error {
        background: rgba(225, 29, 72, 0.2);
        border: 1px solid rgba(225, 29, 72, 0.4);
        color: #fecdd3;
        padding: 0.75rem;
        border-radius: 8px;
        margin-bottom: 1rem;
      }
      .hint {
        font-size: 0.8rem;
        opacity: 0.75;
        text-align: center;
        margin-top: 1rem;
      }
    </style>
  </head>
  <body>
    <form method="post" action="index.php">
      <h1>Statistics login</h1>
      <?php if ($loginError): ?>
        <div class="error"><?= h($loginError) ?></div>
      <?php endif; ?>
      <label for="username">Username</label>
      <input id="username" name="username" type="text" autocomplete="username" required autofocus>

      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>

      <button type="submit">Sign in</button>
      <p class="hint">Default credentials are defined in config.php and stored in MySQL on first login.</p>
    </form>
  </body>
</html>
<?php
    $mysqli->close();
    exit();
}

$currentUser = $_SESSION['stats_username'] ?? 'user';

$totalVisits = 0;
if ($result = $mysqli->query('SELECT COUNT(*) AS total FROM visit_logs')) {
    $row = $result->fetch_assoc();
    if ($row) {
        $totalVisits = (int) $row['total'];
    }
    $result->free();
}

$timezoneRows = [];
if ($result = $mysqli->query("
    SELECT COALESCE(NULLIF(timezone, ''), 'Desconocida') AS tz, COUNT(*) AS hits
    FROM visit_logs
    GROUP BY tz
    ORDER BY hits DESC
    LIMIT 20
")) {
    while ($row = $result->fetch_assoc()) {
        $timezoneRows[] = [
            'timezone' => $row['tz'],
            'hits' => (int) $row['hits'],
        ];
    }
    $result->free();
}

$recentDays = [];
if ($result = $mysqli->query("
    SELECT DATE(created_at) AS visit_date, COUNT(*) AS hits
    FROM visit_logs
    WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
    GROUP BY visit_date
    ORDER BY visit_date DESC
")) {
    while ($row = $result->fetch_assoc()) {
        $recentDays[] = [
            'date' => $row['visit_date'],
            'hits' => (int) $row['hits'],
        ];
    }
    $result->free();
}

$recentLogs = [];
if ($result = $mysqli->query("
    SELECT created_at, timezone, is_friday, forced_mode, season, remote_addr, user_agent
    FROM visit_logs
    ORDER BY id DESC
    LIMIT 50
")) {
    while ($row = $result->fetch_assoc()) {
        $recentLogs[] = $row;
    }
    $result->free();
}

$mysqli->close();

?>
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Visit statistics - esvierneshoy.com</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: system-ui, -apple-system, Segoe UI, sans-serif;
        background: #0f172a;
        color: #e2e8f0;
      }
      body {
        margin: 0;
        padding: 2rem;
      }
      h1, h2 {
        margin-top: 0;
      }
      .grid {
        display: grid;
        gap: 2rem;
      }
      .cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 1.5rem;
      }
      .card {
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 12px;
        padding: 1.5rem;
        box-shadow: 0 18px 45px rgba(15, 23, 42, 0.45);
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 1rem;
        background: rgba(15, 23, 42, 0.4);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 12px;
        overflow: hidden;
      }
      th, td {
        padding: 0.6rem 0.9rem;
        text-align: left;
        border-bottom: 1px solid rgba(148, 163, 184, 0.15);
      }
      th {
        background: rgba(148, 163, 184, 0.12);
        font-weight: 600;
      }
      tbody tr:hover {
        background: rgba(14, 165, 233, 0.12);
      }
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, Liberation Mono, monospace;
        font-size: 0.85rem;
        word-break: break-word;
      }
      footer {
        margin-top: 3rem;
        font-size: 0.875rem;
        opacity: 0.7;
        text-align: center;
      }
      .alert {
        background: rgba(225, 29, 72, 0.18);
        border: 1px solid rgba(225, 29, 72, 0.45);
        color: #fecdd3;
        padding: 0.75rem 1rem;
        border-radius: 8px;
        margin-bottom: 1.5rem;
      }
    </style>
  </head>
  <body>
    <main class="grid">
      <header>
        <h1>Visit statistics</h1>
        <p>Total recorded visits: <strong><?= number_format($totalVisits, 0, ',', '.') ?></strong></p>
        <div class="alert">
          Logged in as <strong><?= h($currentUser) ?></strong>. <a href="?logout=1" style="color:#f9a8d4;">Log out</a>
        </div>
      </header>

      <section class="cards">
        <article class="card">
          <h2>Top 20 timezones</h2>
          <table>
            <thead>
              <tr>
                <th>Timezone</th>
                <th>Visits</th>
              </tr>
            </thead>
            <tbody>
              <?php if ($timezoneRows): ?>
                <?php foreach ($timezoneRows as $row): ?>
                  <tr>
                    <td><?= h($row['timezone']) ?></td>
                    <td><?= number_format($row['hits']) ?></td>
                  </tr>
                <?php endforeach; ?>
              <?php else: ?>
                <tr>
                  <td colspan="2">No data yet.</td>
                </tr>
              <?php endif; ?>
            </tbody>
          </table>
        </article>

        <article class="card">
          <h2>Visits per day (last 14 days)</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Visits</th>
              </tr>
            </thead>
            <tbody>
              <?php if ($recentDays): ?>
                <?php foreach ($recentDays as $row): ?>
                  <tr>
                    <td><?= h($row['date']) ?></td>
                    <td><?= number_format($row['hits']) ?></td>
                  </tr>
                <?php endforeach; ?>
              <?php else: ?>
                <tr>
                  <td colspan="2">No data yet.</td>
                </tr>
              <?php endif; ?>
            </tbody>
          </table>
        </article>
      </section>

      <section>
        <h2>Latest 50 visits</h2>
        <table>
          <thead>
            <tr>
              <th>Recorded</th>
              <th>Timezone</th>
              <th>Friday?</th>
              <th>Forced mode</th>
              <th>Season</th>
              <th>IP (view)</th>
              <th>User agent</th>
            </tr>
          </thead>
          <tbody>
            <?php if ($recentLogs): ?>
              <?php foreach ($recentLogs as $row): ?>
                <tr>
                  <td><?= h($row['created_at']) ?></td>
                  <td><?= h($row['timezone'] ?? 'Unknown') ?></td>
                  <td><?= $row['is_friday'] ? 'Yes' : 'No' ?></td>
                  <td><?= h($row['forced_mode'] ?? 'auto') ?></td>
                  <td><?= h($row['season'] ?? 'n/a') ?></td>
                  <td><?= h($row['remote_addr'] ?? '') ?></td>
                  <td><code><?= h($row['user_agent'] ?? '') ?></code></td>
                </tr>
              <?php endforeach; ?>
            <?php else: ?>
              <tr>
                <td colspan="7">No data yet.</td>
              </tr>
            <?php endif; ?>
          </tbody>
        </table>
      </section>
    </main>
    <footer>
      esvierneshoy.com &mdash; Live statistics from visit_logs · <?= date('Y') ?>
    </footer>
  </body>
</html>
