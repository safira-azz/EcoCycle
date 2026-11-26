<?php
require_once '../config.php';
$db     = getDB();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// ── DASHBOARD ────────────────────────────────────────────
if ($method === 'GET' && $action === 'dashboard') {
    $auth = requireAuth();

    // Global stats from DB
    $totalWaste = (float)$db->query('SELECT COALESCE(SUM(weight_kg),0) FROM waste_processing WHERE status="completed"')->fetchColumn();
    $totalBiogas= (float)$db->query('SELECT COALESCE(SUM(amount),0) FROM energy_outputs WHERE source="biodigester" AND energy_type="biogas"')->fetchColumn();
    $totalOil   = (float)$db->query('SELECT COALESCE(SUM(amount),0) FROM energy_outputs WHERE source="pyrolysis" AND energy_type="pyrolysis_oil"')->fetchColumn();
    // Fallback to simulation values if DB empty
    if ($totalWaste < 1) $totalWaste = 1284.5;
    if ($totalBiogas < 1) $totalBiogas = 48.6;
    if ($totalOil   < 1) $totalOil   = 89.3;

    // User stats
    $stmt = $db->prepare('SELECT eco_points, level, waste_contributed FROM users WHERE id = ?');
    $stmt->execute([$auth['id']]);
    $user = $stmt->fetch();

    // Recent scans for this user
    $stmt = $db->prepare('SELECT ws.waste_name, ws.recommendation, ws.confidence_level, ws.created_at, wc.type, wc.color FROM waste_scans ws LEFT JOIN waste_categories wc ON ws.category_id = wc.id WHERE ws.user_id = ? ORDER BY ws.created_at DESC LIMIT 5');
    $stmt->execute([$auth['id']]);
    $recent = $stmt->fetchAll();

    // Device status
    $stmt = $db->query('SELECT device_id, name, status FROM iot_devices WHERE is_active = 1 ORDER BY type');
    $devices = $stmt->fetchAll();

    jsonOk([
        'stats' => [
            'total_waste_processed'  => round($totalWaste, 1),
            'organic_waste_kg'       => round($totalWaste * 0.59, 1),
            'non_organic_waste_kg'   => round($totalWaste * 0.41, 1),
            'total_biogas_m3'        => round($totalBiogas, 2),
            'total_pyrolysis_oil_l'  => round($totalOil, 2),
            'eco_points'             => (int)($user['eco_points'] ?? 0),
            'level'                  => $user['level'] ?? 'Eco Starter',
            'co2_saved_kg'           => round($totalWaste * 0.243, 1),
            'trees_equivalent'       => max(0, (int)round($totalWaste * 0.011)),
        ],
        'recent_activity' => $recent,
        'system_status'   => $devices,
        'simulation_mode' => SIMULATION_MODE,
    ]);
}

// ── ANALYTICS ────────────────────────────────────────────
if ($method === 'GET' && $action === 'analytics') {
    requireAuth();
    $period = $_GET['period'] ?? 'weekly';
    $days   = ['daily'=>1,'weekly'=>7,'monthly'=>30,'yearly'=>365][$period] ?? 7;

    $labels = []; $organic = []; $nonOrganic = []; $biogas = []; $pyrolysisOil = [];

    for ($i = $days - 1; $i >= 0; $i--) {
        $date = date('Y-m-d', strtotime("-$i days"));
        $fmt  = $days <= 7 ? date('D', strtotime($date)) : ($days <= 30 ? date('d M', strtotime($date)) : date('M Y', strtotime($date)));
        $labels[] = $fmt;

        // Organic scans that day
        $stmt = $db->prepare('SELECT COUNT(*) FROM waste_scans ws JOIN waste_categories wc ON ws.category_id = wc.id WHERE DATE(ws.created_at) = ? AND wc.type = "organic"');
        $stmt->execute([$date]);
        $orgCount = (int)$stmt->fetchColumn();

        $stmt = $db->prepare('SELECT COUNT(*) FROM waste_scans ws JOIN waste_categories wc ON ws.category_id = wc.id WHERE DATE(ws.created_at) = ? AND wc.type != "organic"');
        $stmt->execute([$date]);
        $nonOrgCount = (int)$stmt->fetchColumn();

        // Use real counts * avg weight estimate, or simulation if 0
        $organic[]    = $orgCount    > 0 ? round($orgCount * 0.35, 1)    : round(20 + sin($i * 0.7) * 8 + mt_rand(0,10), 1);
        $nonOrganic[] = $nonOrgCount > 0 ? round($nonOrgCount * 0.28, 1) : round(15 + cos($i * 0.5) * 6 + mt_rand(0,8), 1);

        // Energy from DB
        $stmt = $db->prepare('SELECT COALESCE(SUM(amount),0) FROM energy_outputs WHERE source="biodigester" AND energy_type="biogas" AND date = ?');
        $stmt->execute([$date]);
        $bgVal = (float)$stmt->fetchColumn();
        $biogas[] = $bgVal > 0 ? round($bgVal, 2) : round(2.0 + sin($i * 0.4) * 0.5 + mt_rand(0,5)/10, 2);

        $stmt = $db->prepare('SELECT COALESCE(SUM(amount),0) FROM energy_outputs WHERE source="pyrolysis" AND energy_type="pyrolysis_oil" AND date = ?');
        $stmt->execute([$date]);
        $oilVal = (float)$stmt->fetchColumn();
        $pyrolysisOil[] = $oilVal > 0 ? round($oilVal, 2) : round(4.0 + cos($i * 0.3) * 1.0 + mt_rand(0,8)/10, 2);
    }

    // Category distribution from DB
    $stmt = $db->query('SELECT wc.name AS label, wc.color, COUNT(*) AS cnt FROM waste_scans ws JOIN waste_categories wc ON ws.category_id = wc.id GROUP BY wc.id ORDER BY cnt DESC');
    $rows = $stmt->fetchAll();
    $total = array_sum(array_column($rows, 'cnt')) ?: 1;
    $catDist = array_map(fn($r) => ['label'=>$r['label'],'value'=>round($r['cnt']/$total*100,1),'color'=>$r['color']], $rows);
    if (empty($catDist)) {
        $catDist = [
            ['label'=>'Organic','value'=>38,'color'=>'#22c55e'],['label'=>'Plastic','value'=>24,'color'=>'#3b82f6'],
            ['label'=>'Paper','value'=>16,'color'=>'#f59e0b'],  ['label'=>'Metal','value'=>10,'color'=>'#6b7280'],
            ['label'=>'Glass','value'=>7,'color'=>'#06b6d4'],   ['label'=>'Hazardous','value'=>3,'color'=>'#ef4444'],
            ['label'=>'Residual','value'=>2,'color'=>'#9ca3af'],
        ];
    }

    jsonOk([
        'labels'               => $labels,
        'organic'              => $organic,
        'non_organic'          => $nonOrganic,
        'biogas'               => $biogas,
        'pyrolysis_oil'        => $pyrolysisOil,
        'category_distribution'=> $catDist,
        'totals' => [
            'total_waste'     => round(array_sum($organic) + array_sum($nonOrganic), 1),
            'total_biogas'    => round(array_sum($biogas), 2),
            'total_oil'       => round(array_sum($pyrolysisOil), 2),
            'conversion_rate' => 78.4,
        ],
        'simulation_mode' => SIMULATION_MODE,
    ]);
}

// ── IMPACT ───────────────────────────────────────────────
if ($method === 'GET' && $action === 'impact') {
    $auth = requireAuth();

    $cStmt = $db->prepare('SELECT COUNT(*) FROM waste_scans WHERE user_id = ?');
    $cStmt->execute([$auth['id']]);
    $scans = (int)$cStmt->fetchColumn();

    $stmt = $db->prepare('SELECT eco_points, waste_contributed FROM users WHERE id = ?');
    $stmt->execute([$auth['id']]);
    $user = $stmt->fetch();

    $contributed = (float)($user['waste_contributed'] ?? 0) ?: round($scans * 0.3, 2);

    jsonOk([
        'total_scans'              => $scans,
        'waste_contributed_kg'     => $contributed,
        'organic_waste_kg'         => round($contributed * 0.6, 2),
        'non_organic_waste_kg'     => round($contributed * 0.4, 2),
        'waste_diverted_kg'        => round($contributed * 0.83, 2),
        'estimated_biogas_m3'      => round($scans * 0.05, 3),
        'estimated_pyrolysis_oil_l'=> round($scans * 0.02, 3),
        'co2_saved_kg'             => round($contributed * 0.243, 2),
        'trees_equivalent'         => max(0, (int)round($contributed * 0.011)),
        'eco_points'               => (int)($user['eco_points'] ?? 0),
        'note'                     => 'Values marked ESTIMATED are calculated from average processing yields.',
        'simulation_mode'          => SIMULATION_MODE,
    ]);
}

// ── REWARDS ──────────────────────────────────────────────
if ($method === 'GET' && $action === 'rewards') {
    $auth = requireAuth();
    $rewards = $db->query('SELECT * FROM rewards WHERE is_active = 1 ORDER BY points_required ASC')->fetchAll();

    $stmt = $db->prepare('SELECT rr.*, r.name AS reward_name FROM reward_redemptions rr JOIN rewards r ON rr.reward_id = r.id WHERE rr.user_id = ? ORDER BY rr.created_at DESC LIMIT 10');
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
            ['name'=>'Eco Starter', 'min'=>0,    'max'=>99,    'color'=>'#9ca3af'],
            ['name'=>'Eco Learner', 'min'=>100,  'max'=>499,   'color'=>'#22c55e'],
            ['name'=>'Eco Explorer','min'=>500,  'max'=>999,   'color'=>'#3b82f6'],
            ['name'=>'Eco Warrior', 'min'=>1000, 'max'=>1999,  'color'=>'#8b5cf6'],
            ['name'=>'Eco Expert',  'min'=>2000, 'max'=>4999,  'color'=>'#f59e0b'],
            ['name'=>'Eco Champion','min'=>5000, 'max'=>999999,'color'=>'#ef4444'],
        ],
    ]);
}

// ── REDEEM ───────────────────────────────────────────────
if ($method === 'POST' && $action === 'redeem') {
    $auth     = requireAuth();
    $rewardId = (int)(body()['reward_id'] ?? 0);

    $stmt = $db->prepare('SELECT * FROM rewards WHERE id = ? AND is_active = 1');
    $stmt->execute([$rewardId]);
    $reward = $stmt->fetch();
    if (!$reward) jsonError('Reward not found', 404);

    $stmt = $db->prepare('SELECT eco_points FROM users WHERE id = ?');
    $stmt->execute([$auth['id']]);
    $pts = (int)$stmt->fetchColumn();
    if ($pts < $reward['points_required']) jsonError('Insufficient Eco Points', 400);

    if ($reward['stock'] > 0) {
        $db->prepare('UPDATE rewards SET stock = stock - 1 WHERE id = ? AND stock > 0')->execute([$rewardId]);
    }
    $db->prepare('INSERT INTO reward_redemptions (user_id, reward_id, points_spent) VALUES (?,?,?)')->execute([$auth['id'], $rewardId, $reward['points_required']]);
    $db->prepare('UPDATE users SET eco_points = eco_points - ?, updated_at = NOW() WHERE id = ?')->execute([$reward['points_required'], $auth['id']]);
    $db->prepare('INSERT INTO eco_points (user_id, points, activity_type, description) VALUES (?,?,"redeem",?)')->execute([$auth['id'], -$reward['points_required'], 'Redeemed: ' . $reward['name']]);

    jsonOk(['reward' => $reward], 'Reward redeemed successfully!');
}

// ── NOTIFICATIONS ────────────────────────────────────────
if ($method === 'GET' && $action === 'notifications') {
    $auth = requireAuth();
    $stmt = $db->prepare('SELECT * FROM notifications WHERE user_id = ? OR user_id IS NULL ORDER BY created_at DESC LIMIT 30');
    $stmt->execute([$auth['id']]);
    $notifs = $stmt->fetchAll();
    jsonOk(['notifications' => $notifs]);
}

if ($method === 'PUT' && $action === 'notifications-read') {
    $auth = requireAuth();
    $db->prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?')->execute([$auth['id']]);
    jsonOk([], 'All notifications marked as read');
}

// ── LOCATIONS ────────────────────────────────────────────
if ($method === 'GET' && $action === 'locations') {
    $stmt = $db->query('SELECT * FROM eco_locations WHERE is_active = 1 ORDER BY type, name');
    jsonOk(['locations' => $stmt->fetchAll()]);
}

// ── POINTS HISTORY ───────────────────────────────────────
if ($method === 'GET' && $action === 'points-history') {
    $auth = requireAuth();
    $stmt = $db->prepare('SELECT * FROM eco_points WHERE user_id = ? ORDER BY created_at DESC LIMIT 30');
    $stmt->execute([$auth['id']]);
    jsonOk(['history' => $stmt->fetchAll()]);
}

jsonError('Not found', 404);
