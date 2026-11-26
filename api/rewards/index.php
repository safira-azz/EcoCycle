<?php
// ── EcoCycle Rewards API ──────────────────────────────────
// Dedicated rewards endpoint (aliases to analytics for backwards compat)
// Direct URL: api/rewards/?action=...
require_once '../config.php';
$db     = getDB();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// ── LIST REWARDS ─────────────────────────────────────────
if ($method === 'GET' && $action === 'list') {
    $auth = requireAuth();

    $rewards = $db->query('SELECT * FROM rewards WHERE is_active = 1 ORDER BY points_required ASC')->fetchAll();

    $stmt = $db->prepare('
        SELECT rr.*, r.name AS reward_name, r.reward_type, r.value
        FROM reward_redemptions rr
        JOIN rewards r ON rr.reward_id = r.id
        WHERE rr.user_id = ?
        ORDER BY rr.created_at DESC
        LIMIT 20');
    $stmt->execute([$auth['id']]);
    $history = $stmt->fetchAll();

    $stmt = $db->prepare('SELECT eco_points, level FROM users WHERE id = ?');
    $stmt->execute([$auth['id']]);
    $user = $stmt->fetch();

    jsonOk([
        'rewards' => $rewards,
        'history' => $history,
        'user'    => $user,
        'levels'  => [
            ['name'=>'Eco Starter',  'min'=>0,    'max'=>99,    'color'=>'#9ca3af'],
            ['name'=>'Eco Learner',  'min'=>100,  'max'=>499,   'color'=>'#22c55e'],
            ['name'=>'Eco Explorer', 'min'=>500,  'max'=>999,   'color'=>'#3b82f6'],
            ['name'=>'Eco Warrior',  'min'=>1000, 'max'=>1999,  'color'=>'#8b5cf6'],
            ['name'=>'Eco Expert',   'min'=>2000, 'max'=>4999,  'color'=>'#f59e0b'],
            ['name'=>'Eco Champion', 'min'=>5000, 'max'=>999999,'color'=>'#ef4444'],
        ],
    ]);
}

// ── REDEEM REWARD ────────────────────────────────────────
if ($method === 'POST' && $action === 'redeem') {
    $auth     = requireAuth();
    $rewardId = (int)(body()['reward_id'] ?? 0);
    if (!$rewardId) jsonError('reward_id required', 400);

    $stmt = $db->prepare('SELECT * FROM rewards WHERE id = ? AND is_active = 1');
    $stmt->execute([$rewardId]);
    $reward = $stmt->fetch();
    if (!$reward) jsonError('Reward not found or inactive', 404);

    // Check stock
    if ($reward['stock'] == 0) jsonError('This reward is out of stock', 400);

    // Check user points
    $stmt = $db->prepare('SELECT eco_points FROM users WHERE id = ?');
    $stmt->execute([$auth['id']]);
    $pts = (int)$stmt->fetchColumn();
    if ($pts < $reward['points_required']) {
        jsonError('Insufficient Eco Points. You need ' . $reward['points_required'] . ' pts, you have ' . $pts . ' pts.', 400);
    }

    // Check for recent duplicate redemption (prevent double-click)
    $stmt = $db->prepare('SELECT id FROM reward_redemptions WHERE user_id = ? AND reward_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 5 SECOND)');
    $stmt->execute([$auth['id'], $rewardId]);
    if ($stmt->fetch()) jsonError('Please wait before redeeming again', 429);

    // Deduct stock
    if ($reward['stock'] > 0) {
        $affected = $db->prepare('UPDATE rewards SET stock = stock - 1 WHERE id = ? AND stock > 0');
        $affected->execute([$rewardId]);
        if ($affected->rowCount() === 0) jsonError('Reward ran out of stock', 400);
    }

    // Create redemption record
    $db->prepare('INSERT INTO reward_redemptions (user_id, reward_id, points_spent, status) VALUES (?,?,?,"pending")')
       ->execute([$auth['id'], $rewardId, $reward['points_required']]);

    // Deduct points
    $db->prepare('UPDATE users SET eco_points = eco_points - ?, updated_at = NOW() WHERE id = ?')
       ->execute([$reward['points_required'], $auth['id']]);

    // Ledger entry
    $db->prepare('INSERT INTO eco_points (user_id, points, activity_type, description) VALUES (?,?,"redeem",?)')
       ->execute([$auth['id'], -$reward['points_required'], 'Redeemed: ' . $reward['name']]);

    // Notification
    $db->prepare('INSERT INTO notifications (user_id, type, title, message) VALUES (?,?,"reward",?,"Your redemption is being processed. We will contact you shortly.")')
       ->execute([$auth['id'], 'reward', '🎁 Reward Redeemed: ' . $reward['name']]);

    logAction($auth['id'], 'redeem_reward', "Redeemed reward #{$rewardId}: {$reward['name']} for {$reward['points_required']} pts");

    jsonOk([
        'reward'      => $reward,
        'points_spent'=> $reward['points_required'],
        'new_balance' => $pts - $reward['points_required'],
    ], 'Reward redeemed successfully! Check your notifications for next steps.');
}

// ── REDEMPTION HISTORY ───────────────────────────────────
if ($method === 'GET' && $action === 'history') {
    $auth = requireAuth();
    $stmt = $db->prepare('
        SELECT rr.id, rr.points_spent, rr.status, rr.created_at,
               r.name AS reward_name, r.reward_type, r.description
        FROM reward_redemptions rr
        JOIN rewards r ON rr.reward_id = r.id
        WHERE rr.user_id = ?
        ORDER BY rr.created_at DESC');
    $stmt->execute([$auth['id']]);
    jsonOk(['history' => $stmt->fetchAll()]);
}

// ── POINTS HISTORY ───────────────────────────────────────
if ($method === 'GET' && $action === 'points-history') {
    $auth = requireAuth();
    $stmt = $db->prepare('SELECT * FROM eco_points WHERE user_id = ? ORDER BY created_at DESC LIMIT 50');
    $stmt->execute([$auth['id']]);
    $entries = $stmt->fetchAll();

    $stmt = $db->prepare('SELECT eco_points, level, total_scans, waste_contributed FROM users WHERE id = ?');
    $stmt->execute([$auth['id']]);
    $user = $stmt->fetch();

    jsonOk(['history' => $entries, 'user' => $user]);
}

jsonError('Not found', 404);
