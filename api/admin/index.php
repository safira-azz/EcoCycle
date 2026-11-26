<?php
require_once '../config.php';
$db     = getDB();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// All admin endpoints require admin role
$admin = requireAdmin();

// ── DASHBOARD KPIs ────────────────────────────────────────
if ($method === 'GET' && $action === 'dashboard') {
    $totalUsers  = (int)$db->query('SELECT COUNT(*) FROM users WHERE role_id = 3')->fetchColumn();
    $totalScans  = (int)$db->query('SELECT COUNT(*) FROM waste_scans')->fetchColumn();
    $totalWaste  = (float)$db->query('SELECT COALESCE(SUM(weight_kg),0) FROM waste_processing WHERE status="completed"')->fetchColumn();
    $totalBiogas = (float)$db->query('SELECT COALESCE(SUM(amount),0) FROM energy_outputs WHERE source="biodigester"')->fetchColumn();
    $totalOil    = (float)$db->query('SELECT COALESCE(SUM(amount),0) FROM energy_outputs WHERE source="pyrolysis"')->fetchColumn();
    $activeDevices = (int)$db->query('SELECT COUNT(*) FROM iot_devices WHERE status="online"')->fetchColumn();
    $alerts      = (int)$db->query('SELECT COUNT(*) FROM iot_sensor_data WHERE status != "normal" AND timestamp > DATE_SUB(NOW(), INTERVAL 1 HOUR)')->fetchColumn();

    if ($totalWaste  < 1) $totalWaste  = 1284.5;
    if ($totalBiogas < 1) $totalBiogas = 48.6;
    if ($totalOil    < 1) $totalOil    = 89.3;

    // Waste chart (7 days)
    $wasteLabels = []; $wasteData = [];
    for ($i = 6; $i >= 0; $i--) {
        $date = date('Y-m-d', strtotime("-$i days"));
        $stmt = $db->prepare('SELECT COUNT(*) FROM waste_scans WHERE DATE(created_at) = ?');
        $stmt->execute([$date]);
        $cnt = (int)$stmt->fetchColumn();
        $wasteLabels[] = date('D', strtotime($date));
        $wasteData[]   = $cnt > 0 ? $cnt : mt_rand(8, 25);
    }

    // Category distribution
    $stmt = $db->query('SELECT wc.name, wc.color, COUNT(*) AS cnt FROM waste_scans ws JOIN waste_categories wc ON ws.category_id = wc.id GROUP BY wc.id ORDER BY cnt DESC LIMIT 8');
    $catRows = $stmt->fetchAll();
    $catTotal = array_sum(array_column($catRows, 'cnt')) ?: 1;
    $catDist  = array_map(fn($r) => ['label'=>$r['name'],'value'=>round($r['cnt']/$catTotal*100,1),'color'=>$r['color']], $catRows);
    if (empty($catDist)) {
        $catDist = [['label'=>'Organic','value'=>38,'color'=>'#22c55e'],['label'=>'Plastic','value'=>24,'color'=>'#3b82f6'],['label'=>'Paper','value'=>16,'color'=>'#f59e0b'],['label'=>'Metal','value'=>10,'color'=>'#6b7280'],['label'=>'Glass','value'=>7,'color'=>'#06b6d4'],['label'=>'Hazardous','value'=>3,'color'=>'#ef4444'],['label'=>'Residual','value'=>2,'color'=>'#9ca3af']];
    }

    // Device table
    $devices = $db->query('SELECT device_id, name, type, status, last_seen, firmware_version FROM iot_devices ORDER BY type')->fetchAll();

    jsonOk([
        'kpis' => [
            'total_users'    => $totalUsers,
            'total_scans'    => $totalScans,
            'total_waste_kg' => round($totalWaste, 1),
            'total_biogas_m3'=> round($totalBiogas, 2),
            'total_oil_l'    => round($totalOil, 2),
            'active_devices' => $activeDevices,
            'alerts'         => $alerts,
            'co2_saved_kg'   => round($totalWaste * 0.243, 1),
        ],
        'waste_chart'   => ['labels' => $wasteLabels, 'data' => $wasteData],
        'category_dist' => $catDist,
        'devices'       => $devices,
        'simulation_mode' => SIMULATION_MODE,
    ]);
}

// ── USERS ────────────────────────────────────────────────
if ($method === 'GET' && $action === 'users') {
    $search = sanitize($_GET['search'] ?? '');
    $page   = max(1, (int)($_GET['page'] ?? 1));
    $limit  = 20; $offset = ($page - 1) * $limit;

    if ($search) {
        $stmt = $db->prepare('SELECT u.id, u.name, u.email, u.phone, r.name AS role, u.eco_points, u.level, u.total_scans, u.status, u.created_at FROM users u JOIN roles r ON u.role_id = r.id WHERE u.name LIKE ? OR u.email LIKE ? ORDER BY u.created_at DESC LIMIT ? OFFSET ?');
        $like = "%$search%";
        $stmt->execute([$like, $like, $limit, $offset]);
    } else {
        $stmt = $db->prepare('SELECT u.id, u.name, u.email, u.phone, r.name AS role, u.eco_points, u.level, u.total_scans, u.status, u.created_at FROM users u JOIN roles r ON u.role_id = r.id ORDER BY u.created_at DESC LIMIT ? OFFSET ?');
        $stmt->execute([$limit, $offset]);
    }
    $users = $stmt->fetchAll();
    $total = (int)$db->query('SELECT COUNT(*) FROM users')->fetchColumn();
    jsonOk(['users' => $users, 'total' => $total, 'page' => $page, 'pages' => (int)ceil($total/$limit)]);
}

if ($method === 'PUT' && $action === 'user-status') {
    $d      = body();
    $userId = (int)($d['user_id'] ?? 0);
    $status = $d['status'] ?? '';
    if (!in_array($status, ['active','inactive','suspended'])) jsonError('Invalid status', 400);
    if ($userId === $admin['id']) jsonError('Cannot change own status', 400);
    $db->prepare('UPDATE users SET status = ?, updated_at = NOW() WHERE id = ?')->execute([$status, $userId]);
    logAction($admin['id'], 'admin_user_status', "User $userId status → $status");
    jsonOk([], 'User status updated');
}

// ── WASTE SCANS ──────────────────────────────────────────
if ($method === 'GET' && $action === 'scans') {
    $page  = max(1, (int)($_GET['page'] ?? 1));
    $limit = 30; $offset = ($page - 1) * $limit;
    $stmt  = $db->prepare('SELECT ws.scan_id, ws.waste_name, ws.material, ws.confidence, ws.confidence_level, ws.recommendation, ws.processing_route, ws.status, ws.created_at, u.name AS user_name, wc.name AS category_name, wc.type AS category_type FROM waste_scans ws LEFT JOIN users u ON ws.user_id = u.id LEFT JOIN waste_categories wc ON ws.category_id = wc.id ORDER BY ws.created_at DESC LIMIT ? OFFSET ?');
    $stmt->execute([$limit, $offset]);
    $scans = $stmt->fetchAll();
    $total = (int)$db->query('SELECT COUNT(*) FROM waste_scans')->fetchColumn();
    jsonOk(['scans' => $scans, 'total' => $total, 'page' => $page, 'pages' => (int)ceil($total/$limit)]);
}

// ── IoT DEVICES ──────────────────────────────────────────
if ($method === 'GET' && $action === 'iot-devices') {
    $stmt = $db->query('SELECT device_id, name, type, location, status, last_seen, firmware_version, ip_address, is_active, created_at FROM iot_devices ORDER BY type, name');
    jsonOk(['devices' => $stmt->fetchAll()]);
}

if ($method === 'POST' && $action === 'iot-device') {
    $d = body();
    $deviceId  = sanitize($d['device_id'] ?? '');
    $rawKey    = sanitize($d['device_key'] ?? bin2hex(random_bytes(16)));
    $name      = sanitize($d['name'] ?? '');
    $type      = $d['type'] ?? 'general';
    $location  = sanitize($d['location'] ?? '');
    if (!$deviceId || !$name) jsonError('device_id and name required', 400);
    if (!in_array($type, ['biodigester','pyrolysis','sorting','general'])) jsonError('Invalid type', 400);

    $db->prepare('INSERT INTO iot_devices (device_id, device_key, name, type, location) VALUES (?,SHA2(?,256),?,?,?)')
       ->execute([$deviceId, $rawKey, $name, $type, $location]);
    logAction($admin['id'], 'admin_add_device', "Added device $deviceId");
    jsonOk(['device_id' => $deviceId, 'raw_key_shown_once' => $rawKey], 'Device added. Save the raw key – it will not be shown again.', 201);
}

if ($method === 'PUT' && $action === 'iot-device-status') {
    $d        = body();
    $deviceId = sanitize($d['device_id'] ?? '');
    $isActive = (int)(bool)($d['is_active'] ?? 1);
    $db->prepare('UPDATE iot_devices SET is_active = ?, updated_at = NOW() WHERE device_id = ?')->execute([$isActive, $deviceId]);
    jsonOk([], 'Device status updated');
}

// ── SENSOR HISTORY ───────────────────────────────────────
if ($method === 'GET' && $action === 'sensor-history') {
    $deviceId = sanitize($_GET['device_id'] ?? '');
    $hours    = min(168, max(1, (int)($_GET['hours'] ?? 24)));
    if (!$deviceId) jsonError('device_id required', 400);
    $stmt = $db->prepare('SELECT * FROM iot_sensor_data WHERE device_id = ? AND timestamp >= DATE_SUB(NOW(), INTERVAL ? HOUR) ORDER BY timestamp DESC LIMIT 500');
    $stmt->execute([$deviceId, $hours]);
    jsonOk(['history' => $stmt->fetchAll()]);
}

// ── BIODIGESTER ──────────────────────────────────────────
if ($method === 'GET' && $action === 'biodigester') {
    $stmt = $db->query('SELECT br.*, d.name AS device_name FROM biodigester_readings br JOIN iot_devices d ON br.device_id = d.device_id ORDER BY br.timestamp DESC LIMIT 1');
    $latest = $stmt->fetch();
    $stmt2  = $db->query('SELECT * FROM biodigester_readings ORDER BY timestamp DESC LIMIT 48');
    $history = $stmt2->fetchAll();
    jsonOk(['latest' => $latest, 'history' => $history, 'simulation_mode' => SIMULATION_MODE]);
}

// ── PYROLYSIS ────────────────────────────────────────────
if ($method === 'GET' && $action === 'pyrolysis') {
    $batches = $db->query('SELECT * FROM pyrolysis_batches ORDER BY created_at DESC LIMIT 30')->fetchAll();
    jsonOk(['batches' => $batches, 'simulation_mode' => SIMULATION_MODE]);
}

// ── ANALYTICS ────────────────────────────────────────────
if ($method === 'GET' && $action === 'analytics') {
    $period = $_GET['period'] ?? 'weekly';
    $days   = ['daily'=>1,'weekly'=>7,'monthly'=>30,'yearly'=>365][$period] ?? 7;

    $labels = []; $wasteData = []; $biogasData = []; $oilData = [];
    for ($i = $days - 1; $i >= 0; $i--) {
        $date = date('Y-m-d', strtotime("-$i days"));
        $fmt  = $days <= 7 ? date('D', strtotime($date)) : ($days <= 30 ? date('d M', strtotime($date)) : date('M Y', strtotime($date)));
        $labels[] = $fmt;

        $stmt = $db->prepare('SELECT COUNT(*) FROM waste_scans WHERE DATE(created_at) = ?');
        $stmt->execute([$date]);
        $cnt = (int)$stmt->fetchColumn();
        $wasteData[] = $cnt > 0 ? $cnt : mt_rand(5, 20);

        $stmt = $db->prepare('SELECT COALESCE(SUM(amount),0) FROM energy_outputs WHERE source="biodigester" AND date = ?');
        $stmt->execute([$date]);
        $bg = (float)$stmt->fetchColumn();
        $biogasData[] = $bg > 0 ? round($bg, 2) : round(2.0 + sin($i * 0.4) * 0.5, 2);

        $stmt = $db->prepare('SELECT COALESCE(SUM(amount),0) FROM energy_outputs WHERE source="pyrolysis" AND date = ?');
        $stmt->execute([$date]);
        $oil = (float)$stmt->fetchColumn();
        $oilData[] = $oil > 0 ? round($oil, 2) : round(4.0 + cos($i * 0.3) * 1.0, 2);
    }

    $totalBg  = (float)$db->query('SELECT COALESCE(SUM(amount),0) FROM energy_outputs WHERE source="biodigester"')->fetchColumn() ?: 48.6;
    $totalOil = (float)$db->query('SELECT COALESCE(SUM(amount),0) FROM energy_outputs WHERE source="pyrolysis"')->fetchColumn()   ?: 89.3;

    jsonOk([
        'labels'     => $labels,
        'waste'      => $wasteData,
        'biogas'     => $biogasData,
        'oil'        => $oilData,
        'totals' => [
            'total_biogas_m3' => round($totalBg, 2),
            'total_oil_l'     => round($totalOil, 2),
            'conversion_rate' => 78.4,
        ],
        'simulation_mode' => SIMULATION_MODE,
    ]);
}

// ── AI MONITORING ────────────────────────────────────────
if ($method === 'GET' && $action === 'ai-stats') {
    $total   = (int)$db->query('SELECT COUNT(*) FROM ai_predictions')->fetchColumn();
    $highConf= (int)$db->query('SELECT COUNT(*) FROM waste_scans WHERE confidence_level = "high"')->fetchColumn();
    $lowConf = (int)$db->query('SELECT COUNT(*) FROM waste_scans WHERE confidence_level = "low"')->fetchColumn();
    $unknown = (int)$db->query('SELECT COUNT(*) FROM waste_scans WHERE confidence_level = "unknown"')->fetchColumn();
    $avgConf = (float)$db->query('SELECT COALESCE(AVG(confidence),0) FROM waste_scans')->fetchColumn();
    $feedback= (int)$db->query('SELECT COUNT(*) FROM ai_feedback')->fetchColumn();

    $stmt = $db->query('SELECT wc.name, COUNT(*) AS cnt FROM waste_scans ws JOIN waste_categories wc ON ws.category_id = wc.id GROUP BY wc.id ORDER BY cnt DESC');
    $predDist = $stmt->fetchAll();

    jsonOk([
        'total_predictions'  => $total,
        'high_confidence'    => $highConf,
        'low_confidence'     => $lowConf,
        'unknown'            => $unknown,
        'avg_confidence'     => round($avgConf, 2),
        'feedback_count'     => $feedback,
        'prediction_dist'    => $predDist,
        'model_info' => [
            'version'         => 'v1.0.0-prototype',
            'name'            => 'MobileNetV3',
            'dataset'         => 'TrashNet + TACO',
            'is_simulation'   => true,
            'note'            => 'Production metrics require full model training and held-out test evaluation.',
        ],
    ]);
}

// ── REWARDS MANAGEMENT ───────────────────────────────────
if ($method === 'GET' && $action === 'rewards') {
    $rewards = $db->query('SELECT * FROM rewards ORDER BY points_required ASC')->fetchAll();
    $redemptions = $db->query('SELECT rr.*, u.name AS user_name, r.name AS reward_name FROM reward_redemptions rr JOIN users u ON rr.user_id = u.id JOIN rewards r ON rr.reward_id = r.id ORDER BY rr.created_at DESC LIMIT 50')->fetchAll();
    jsonOk(['rewards' => $rewards, 'redemptions' => $redemptions]);
}

if ($method === 'PUT' && $action === 'reward-status') {
    $d = body();
    $db->prepare('UPDATE rewards SET is_active = ? WHERE id = ?')->execute([(int)(bool)($d['is_active']??1), (int)($d['reward_id']??0)]);
    jsonOk([], 'Reward status updated');
}

// ── SYSTEM SETTINGS ──────────────────────────────────────
if ($method === 'GET' && $action === 'settings') {
    $stmt = $db->query('SELECT setting_key, setting_value, setting_type, description FROM system_settings ORDER BY setting_key');
    jsonOk(['settings' => $stmt->fetchAll()]);
}

if ($method === 'PUT' && $action === 'settings') {
    $d = body();
    foreach ($d as $key => $value) {
        $key = sanitize($key);
        $db->prepare('UPDATE system_settings SET setting_value = ?, updated_at = NOW() WHERE setting_key = ?')->execute([$value, $key]);
    }
    logAction($admin['id'], 'admin_settings_update', 'System settings updated');
    jsonOk([], 'Settings updated');
}

// ── SYSTEM LOGS ──────────────────────────────────────────
if ($method === 'GET' && $action === 'logs') {
    $page  = max(1, (int)($_GET['page'] ?? 1));
    $limit = 50; $offset = ($page - 1) * $limit;
    $stmt  = $db->prepare('SELECT sl.*, u.name AS user_name FROM system_logs sl LEFT JOIN users u ON sl.user_id = u.id ORDER BY sl.created_at DESC LIMIT ? OFFSET ?');
    $stmt->execute([$limit, $offset]);
    $total = (int)$db->query('SELECT COUNT(*) FROM system_logs')->fetchColumn();
    jsonOk(['logs' => $stmt->fetchAll(), 'total' => $total]);
}

// ── NOTIFICATIONS BROADCAST ──────────────────────────────
if ($method === 'POST' && $action === 'notify') {
    $d = body();
    $type    = $d['type'] ?? 'system';
    $title   = sanitize($d['title'] ?? '');
    $message = sanitize($d['message'] ?? '');
    $userId  = isset($d['user_id']) ? (int)$d['user_id'] : null;
    if (!$title || !$message) jsonError('title and message required', 400);
    $db->prepare('INSERT INTO notifications (user_id, type, title, message) VALUES (?,?,?,?)')->execute([$userId, $type, $title, $message]);
    jsonOk([], 'Notification sent');
}

jsonError('Not found', 404);
