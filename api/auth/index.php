<?php
require_once '../config.php';
$db     = getDB();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// ── REGISTER ─────────────────────────────────────────────
if ($method === 'POST' && $action === 'register') {
    $d        = body();
    $name     = sanitize($d['name'] ?? '');
    $email    = strtolower(trim($d['email'] ?? ''));
    $phone    = sanitize($d['phone'] ?? '');
    $password = $d['password'] ?? '';

    $errs = [];
    if (!$name)                                    $errs['name']     = 'Name is required';
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) $errs['email']    = 'Invalid email address';
    if (strlen($password) < 8)                     $errs['password'] = 'Password must be at least 8 characters';
    if ($errs) jsonError('Validation failed', 422, $errs);

    $stmt = $db->prepare('SELECT id FROM users WHERE email = ?');
    $stmt->execute([$email]);
    if ($stmt->fetch()) jsonError('Email already registered', 409);

    $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
    $db->prepare('INSERT INTO users (role_id, name, email, phone, password) VALUES (3,?,?,?,?)')
       ->execute([$name, $email, $phone, $hash]);
    $userId = (int)$db->lastInsertId();

    // Welcome points
    $db->prepare('INSERT INTO eco_points (user_id, points, activity_type, description) VALUES (?,50,"welcome","Welcome to EcoCycle!")')->execute([$userId]);
    $db->prepare('UPDATE users SET eco_points = 50 WHERE id = ?')->execute([$userId]);

    $user  = fetchUser($db, $userId);
    $token = createToken($user);
    logAction($userId, 'register', 'New user registered');
    jsonOk(['token' => $token, 'user' => $user], 'Registration successful', 201);
}

// ── LOGIN ────────────────────────────────────────────────
if ($method === 'POST' && $action === 'login') {
    $d        = body();
    $email    = strtolower(trim($d['email'] ?? ''));
    $password = $d['password'] ?? '';

    if (!$email || !$password) jsonError('Email and password required', 400);

    $stmt = $db->prepare('SELECT u.*, r.name AS role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.email = ? AND u.status = "active"');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password'])) {
        jsonError('Invalid email or password', 401);
    }

    unset($user['password']);
    $token = createToken($user);
    logAction((int)$user['id'], 'login', 'User logged in');
    jsonOk(['token' => $token, 'user' => $user]);
}

// ── ME ───────────────────────────────────────────────────
if ($method === 'GET' && $action === 'me') {
    $auth = requireAuth();
    $user = fetchUser($db, $auth['id']);
    if (!$user) jsonError('User not found', 404);
    jsonOk(['user' => $user]);
}

// ── UPDATE PROFILE ───────────────────────────────────────
if ($method === 'PUT' && $action === 'profile') {
    $auth  = requireAuth();
    $d     = body();
    $name  = sanitize($d['name'] ?? '');
    $phone = sanitize($d['phone'] ?? '');
    if (!$name) jsonError('Name is required', 400);
    $db->prepare('UPDATE users SET name = ?, phone = ?, updated_at = NOW() WHERE id = ?')
       ->execute([$name, $phone, $auth['id']]);
    jsonOk([], 'Profile updated');
}

// ── CHANGE PASSWORD ──────────────────────────────────────
if ($method === 'POST' && $action === 'change-password') {
    $auth    = requireAuth();
    $d       = body();
    $current = $d['current_password'] ?? '';
    $new     = $d['new_password'] ?? '';
    if (strlen($new) < 8) jsonError('New password must be at least 8 characters', 400);

    $stmt = $db->prepare('SELECT password FROM users WHERE id = ?');
    $stmt->execute([$auth['id']]);
    $row = $stmt->fetch();
    if (!$row || !password_verify($current, $row['password'])) jsonError('Current password is incorrect', 401);

    $hash = password_hash($new, PASSWORD_BCRYPT, ['cost' => 12]);
    $db->prepare('UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?')->execute([$hash, $auth['id']]);
    logAction($auth['id'], 'change_password', 'Password changed');
    jsonOk([], 'Password changed successfully');
}

// ── FORGOT PASSWORD ──────────────────────────────────────
if ($method === 'POST' && $action === 'forgot-password') {
    // Always return success to prevent email enumeration
    jsonOk([], 'If this email exists, a reset link has been sent.');
}

// ── LOGOUT ───────────────────────────────────────────────
if ($method === 'POST' && $action === 'logout') {
    $auth = getAuthUser();
    if ($auth) logAction($auth['id'], 'logout', 'User logged out');
    jsonOk([], 'Logged out');
}

jsonError('Not found', 404);

// ── HELPER ───────────────────────────────────────────────
function fetchUser(PDO $db, int $id): ?array {
    $stmt = $db->prepare('SELECT u.id, u.name, u.email, u.phone, r.name AS role, u.eco_points, u.level, u.total_scans, u.waste_contributed, u.profile_image, u.status, u.created_at FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?');
    $stmt->execute([$id]);
    return $stmt->fetch() ?: null;
}
