<?php
require_once '../config.php';
$db     = getDB();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// ── ESP32: POST SENSOR DATA ───────────────────────────────
// Endpoint: POST /api/iot/?action=sensor-data
// Headers:  X-Device-Id, X-Device-Key  (or body fields)
if ($method === 'POST' && $action === 'sensor-data') {
    $device = requireDeviceAuth();
    $d      = body();
    $sensorType = sanitize($d['sensor_type'] ?? '');
    $value      = (float)($d['value'] ?? 0);
    $unit       = sanitize($d['unit'] ?? '');
    if (!$sensorType) jsonError('sensor_type required', 400);

    // Determine status thresholds
    $status = 'normal';
    if ($sensorType === 'temperature' && ($value < 25 || $value > 45)) $status = 'warning';
    if ($sensorType === 'ph'          && ($value < 5.5 || $value > 8.5)) $status = 'warning';
    if ($sensorType === 'pressure'    && $value > 2.0)                   $status = 'critical';

    $db->prepare('INSERT INTO iot_sensor_data (device_id, sensor_type, value, unit, status) VALUES (?,?,?,?,?)')
       ->execute([$device['device_id'], $sensorType, $value, $unit, $status]);

    // If warning/critical → create notification
    if ($status !== 'normal') {
        $db->prepare('INSERT INTO notifications (type, title, message) VALUES ("sensor_warning",?,?)')
           ->execute(["Sensor Alert – {$device['name']}", "{$device['name']}: {$sensorType} = {$value} {$unit} ({$status})"]);
    }

    jsonOk(['received' => true, 'status' => $status, 'timestamp' => date('Y-m-d H:i:s')]);
}

// ── ESP32: POST BIODIGESTER READING ──────────────────────
if ($method === 'POST' && $action === 'biodigester-reading') {
    $device = requireDeviceAuth();
    $d      = body();
    $db->prepare('INSERT INTO biodigester_readings (device_id, temperature, ph_level, pressure, volume, fermentation_day, fermentation_total, biogas_volume, gas_production_rate, organic_input_kg, process_status, is_simulation) VALUES (?,?,?,?,?,?,?,?,?,?,?,0)')
       ->execute([
           $device['device_id'],
           (float)($d['temperature'] ?? 0),
           (float)($d['ph_level'] ?? 0),
           (float)($d['pressure'] ?? 0),
           (float)($d['volume'] ?? 0),
           (int)($d['fermentation_day'] ?? 0),
           (int)($d['fermentation_total'] ?? 21),
           (float)($d['biogas_volume'] ?? 0),
           (float)($d['gas_production_rate'] ?? 0),
           (float)($d['organic_input_kg'] ?? 0),
           calcFermentationStatus($d),
       ]);
    jsonOk(['received' => true]);
}

// ── ESP32: POST PYROLYSIS READING ────────────────────────
if ($method === 'POST' && $action === 'pyrolysis-reading') {
    $device = requireDeviceAuth();
    $d      = body();
    $batchId = sanitize($d['batch_id'] ?? '');
    $db->prepare('INSERT INTO pyrolysis_readings (batch_id, device_id, reactor_temp, heater_temp, reactor_pressure, condenser_temp, heating_duration_min, cooling_status, energy_consumption_kwh, is_simulation) VALUES (?,?,?,?,?,?,?,?,?,0)')
       ->execute([
           $batchId ?: null,
           $device['device_id'],
           (float)($d['reactor_temp'] ?? 0),
           (float)($d['heater_temp'] ?? 0),
           (float)($d['reactor_pressure'] ?? 0),
           (float)($d['condenser_temp'] ?? 0),
           (int)($d['heating_duration_min'] ?? 0),
           (int)($d['cooling_status'] ?? 0),
           (float)($d['energy_consumption_kwh'] ?? 0),
       ]);
    jsonOk(['received' => true]);
}

// ── GET DEVICES ──────────────────────────────────────────
if ($method === 'GET' && $action === 'devices') {
    requireAuth();
    $stmt = $db->query('SELECT device_id, name, type, location, status, last_seen, firmware_version, is_active FROM iot_devices ORDER BY type, name');
    jsonOk(['devices' => $stmt->fetchAll()]);
}

// ── GET BIODIGESTER DATA ─────────────────────────────────
if ($method === 'GET' && $action === 'biodigester') {
    requireAuth();
    $deviceId = sanitize($_GET['device_id'] ?? 'BD-001');

    // Try latest real reading first
    $stmt = $db->prepare('SELECT * FROM biodigester_readings WHERE device_id = ? ORDER BY timestamp DESC LIMIT 1');
    $stmt->execute([$deviceId]);
    $real = $stmt->fetch();

    if ($real && !$real['is_simulation']) {
        jsonOk(['data' => $real, 'simulation_mode' => false]);
    }

    // Fall back to simulation
    $data = simulateBiodigester($deviceId);
    // Persist simulation reading (throttled: max 1 per minute)
    $stmt = $db->prepare('SELECT id FROM biodigester_readings WHERE device_id = ? AND timestamp > DATE_SUB(NOW(), INTERVAL 1 MINUTE) LIMIT 1');
    $stmt->execute([$deviceId]);
    if (!$stmt->fetch()) {
        $db->prepare('INSERT INTO biodigester_readings (device_id, temperature, ph_level, pressure, volume, fermentation_day, fermentation_total, biogas_volume, gas_production_rate, organic_input_kg, process_status, is_simulation) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)')
           ->execute([$deviceId, $data['temperature'], $data['ph_level'], $data['pressure'], $data['volume'], $data['fermentation_day'], $data['fermentation_total_days'], $data['biogas_volume'], $data['gas_production_rate'], $data['organic_input_kg'], $data['process_status']]);
    }
    jsonOk(['data' => $data, 'simulation_mode' => true]);
}

// ── GET BIODIGESTER HISTORY ──────────────────────────────
if ($method === 'GET' && $action === 'biodigester-history') {
    requireAuth();
    $deviceId = sanitize($_GET['device_id'] ?? 'BD-001');
    $hours    = min(168, max(1, (int)($_GET['hours'] ?? 24)));
    $stmt = $db->prepare('SELECT * FROM biodigester_readings WHERE device_id = ? AND timestamp >= DATE_SUB(NOW(), INTERVAL ? HOUR) ORDER BY timestamp ASC LIMIT 200');
    $stmt->execute([$deviceId, $hours]);
    jsonOk(['history' => $stmt->fetchAll()]);
}

// ── GET PYROLYSIS DATA ───────────────────────────────────
if ($method === 'GET' && $action === 'pyrolysis') {
    requireAuth();
    $deviceId = sanitize($_GET['device_id'] ?? 'PY-001');
    $data = simulatePyrolysis($deviceId);
    jsonOk(['data' => $data, 'simulation_mode' => true]);
}

// ── GET PYROLYSIS BATCHES ────────────────────────────────
if ($method === 'GET' && $action === 'pyrolysis-batches') {
    requireAuth();
    $stmt = $db->query('SELECT * FROM pyrolysis_batches ORDER BY created_at DESC LIMIT 20');
    $batches = $stmt->fetchAll();
    jsonOk(['batches' => $batches, 'simulation_mode' => SIMULATION_MODE]);
}

// ── GET ENERGY DATA ──────────────────────────────────────
if ($method === 'GET' && $action === 'energy') {
    requireAuth();
    $period = $_GET['period'] ?? 'weekly';
    $days   = ['daily'=>1,'weekly'=>7,'monthly'=>30,'yearly'=>365][$period] ?? 7;

    // Real data from energy_outputs
    $stmt = $db->prepare('SELECT date, SUM(amount) AS total FROM energy_outputs WHERE source = "biodigester" AND energy_type = "biogas" AND date >= DATE_SUB(CURDATE(), INTERVAL ? DAY) GROUP BY date ORDER BY date ASC');
    $stmt->execute([$days]);
    $realBiogas = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

    $stmt = $db->prepare('SELECT date, SUM(amount) AS total FROM energy_outputs WHERE source = "pyrolysis" AND energy_type = "pyrolysis_oil" AND date >= DATE_SUB(CURDATE(), INTERVAL ? DAY) GROUP BY date ORDER BY date ASC');
    $stmt->execute([$days]);
    $realOil = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

    $biogas = []; $pyrolysis = [];
    for ($i = $days - 1; $i >= 0; $i--) {
        $date = date('Y-m-d', strtotime("-$i days"));
        $bgVal = isset($realBiogas[$date]) ? (float)$realBiogas[$date] : round(2.0 + sin($i * 0.5) * 0.4 + (mt_rand(0,8)/10), 2);
        $pyVal = isset($realOil[$date])    ? (float)$realOil[$date]    : round(4.5 + sin($i * 0.3) * 0.8 + (mt_rand(0,8)/10), 2);
        $biogas[]    = ['date' => $date, 'value' => $bgVal, 'unit' => 'm³'];
        $pyrolysis[] = ['date' => $date, 'value' => $pyVal, 'unit' => 'L'];
    }

    // Totals from DB
    $totalBg  = (float)$db->query('SELECT COALESCE(SUM(amount),0) FROM energy_outputs WHERE source="biodigester" AND energy_type="biogas"')->fetchColumn();
    $totalOil = (float)$db->query('SELECT COALESCE(SUM(amount),0) FROM energy_outputs WHERE source="pyrolysis" AND energy_type="pyrolysis_oil"')->fetchColumn();
    if ($totalBg  < 1) $totalBg  = 48.6;
    if ($totalOil < 1) $totalOil = 89.3;

    jsonOk([
        'biogas'       => $biogas,
        'pyrolysis_oil'=> $pyrolysis,
        'totals' => [
            'total_biogas_m3'      => round($totalBg, 2),
            'total_pyrolysis_oil_l'=> round($totalOil, 2),
            'daily_biogas_avg'     => round(array_sum(array_column($biogas,'value')) / max(1,$days), 2),
            'daily_oil_avg'        => round(array_sum(array_column($pyrolysis,'value')) / max(1,$days), 2),
        ],
        'simulation_mode' => SIMULATION_MODE,
    ]);
}

jsonError('Not found', 404);

// ── SIMULATION HELPERS ────────────────────────────────────
function simulateBiodigester(string $deviceId): array {
    $day      = (int)(time() / 86400) % 21 + 1;
    $temp     = round(35.0 + sin(time() / 3600) * 1.5, 1);
    $ph       = round(6.8  + sin(time() / 7200) * 0.3, 2);
    $pressure = round(1.05 + sin(time() / 1800) * 0.05, 3);
    $rate     = round(0.15 + ($day / 21) * 0.08 + sin(time() / 900) * 0.02, 3);
    $total    = round($rate * $day * 24 * 0.7, 2);
    $status   = 'optimal';
    if ($temp < 30 || $temp > 40) $status = 'needs_attention';
    if ($ph   < 6.0 || $ph   > 8.0) $status = 'needs_attention';
    return [
        'device_id'             => $deviceId,
        'temperature'           => $temp,
        'ph_level'              => $ph,
        'pressure'              => $pressure,
        'volume'                => 80.0,
        'fermentation_day'      => $day,
        'fermentation_total_days'=> 21,
        'biogas_volume'         => $total,
        'gas_production_rate'   => $rate,
        'process_status'        => $status,
        'organic_input_kg'      => 45.5,
        'simulation'            => true,
        'timestamp'             => date('Y-m-d H:i:s'),
    ];
}

function simulatePyrolysis(string $deviceId): array {
    $phase  = (int)(time() / 600) % 4;
    $phases = ['idle','heating','running','cooling'];
    $temps  = [25, 280, 450, 120];
    return [
        'device_id'             => $deviceId,
        'batch_id'              => 'BATCH-' . date('Ymd') . '-028',
        'reactor_temp'          => $temps[$phase] + mt_rand(-5, 5),
        'heater_temp'           => $temps[$phase] + mt_rand(10, 30),
        'reactor_pressure'      => round(1.0 + ($phase === 2 ? 0.3 : 0.05), 3),
        'condenser_temp'        => round(25 + ($phase === 2 ? 15 : 0), 1),
        'heating_duration_min'  => $phase >= 1 ? mt_rand(45, 90) : 0,
        'oil_volume_liters'     => $phase === 3 ? 5.1 : 0,
        'gas_volume_m3'         => $phase >= 2 ? 1.2 : 0,
        'residue_kg'            => $phase === 3 ? 0.8 : 0,
        'oil_yield_percent'     => $phase === 3 ? 51.0 : 0,
        'energy_consumption_kwh'=> round(mt_rand(8,15) + $phase * 2, 2),
        'process_stability'     => 95.0,
        'performance_score'     => 91.0,
        'status'                => $phases[$phase],
        'input_weight_kg'       => 10.0,
        'input_material'        => 'PE/PP Mixed',
        'simulation'            => true,
        'timestamp'             => date('Y-m-d H:i:s'),
    ];
}

function calcFermentationStatus(array $d): string {
    $temp = (float)($d['temperature'] ?? 35);
    $ph   = (float)($d['ph_level']   ?? 7);
    $rate = (float)($d['gas_production_rate'] ?? 0);
    $day  = (int)($d['fermentation_day'] ?? 0);
    $total= (int)($d['fermentation_total'] ?? 21);
    if ($day >= $total && $rate < 0.05) return 'completed';
    if ($temp < 28 || $temp > 42 || $ph < 5.5 || $ph > 8.5) return 'needs_attention';
    if ($rate > 0.12) return 'optimal';
    return 'fermenting';
}
