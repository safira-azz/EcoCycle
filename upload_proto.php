<?php
/**
 * EcoCycle - Upload Foto Prototype Mesin
 * URL: http://localhost/sampah/upload_proto.php
 * Hapus file ini setelah selesai upload!
 */
$targetDir = __DIR__ . '/assets/img/';
$machines  = [
    'biodigester' => ['label' => 'Smart Biodigester',          'color' => '#16a34a', 'icon' => '&#127807;'],
    'recycling'   => ['label' => 'Smart Recycling System',     'color' => '#3b82f6', 'icon' => '&#9851;&#65039;'],
    'iot'         => ['label' => 'IoT Control Box (ESP32)',     'color' => '#8b5cf6', 'icon' => '&#128225;'],
];
$msg = ''; $errors = []; $success = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    foreach (array_keys($machines) as $key) {
        if (empty($_FILES[$key]['tmp_name']) || $_FILES[$key]['error'] !== UPLOAD_ERR_OK) continue;
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime  = $finfo->file($_FILES[$key]['tmp_name']);
        if (!isset($allowed[$mime])) { $errors[] = "$key: Format tidak valid (gunakan JPG/PNG/WEBP)"; continue; }
        if ($_FILES[$key]['size'] > 10*1024*1024) { $errors[] = "$key: Ukuran terlalu besar (maks 10MB)"; continue; }
        $ext  = $allowed[$mime];
        $dest = $targetDir . $key . '.' . $ext;
        if (move_uploaded_file($_FILES[$key]['tmp_name'], $dest)) {
            $success[] = "$key.$ext berhasil disimpan (" . round($_FILES[$key]['size']/1024) . " KB)";
        } else {
            $errors[] = "$key: Gagal menyimpan — periksa izin folder assets/img/";
        }
    }
}

// Cek file yang sudah ada
$existing = [];
foreach (array_keys($machines) as $key) {
    foreach (['jpg','png','webp'] as $ext) {
        if (file_exists($targetDir . $key . '.' . $ext)) {
            $size = round(filesize($targetDir . $key . '.' . $ext) / 1024);
            $existing[$key] = "$key.$ext ($size KB)";
            break;
        }
    }
}
?><!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Upload Foto Prototype - EcoCycle</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Plus Jakarta Sans', sans-serif;
    background: linear-gradient(145deg, #ecf5ec, #f3f8f1);
    min-height: 100vh; padding: 24px;
    display: flex; align-items: flex-start; justify-content: center;
  }
  .wrap { width: 100%; max-width: 560px; }
  .logo { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; }
  .logo-icon { width: 40px; height: 40px; background: linear-gradient(135deg,#0d4a2e,#16a34a); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; }
  .logo-text { font-size: 1.2rem; font-weight: 900; color: #0d4a2e; }
  .logo-text span { color: #16a34a; }
  h1 { font-size: 1.25rem; font-weight: 800; color: #0a1628; margin-bottom: 4px; }
  .subtitle { font-size: 0.82rem; color: #6b7c93; margin-bottom: 20px; }

  .alert { padding: 12px 16px; border-radius: 10px; margin-bottom: 16px; font-size: 0.82rem; font-weight: 600; }
  .alert-success { background: #f0fdf4; border: 1.5px solid #22c55e; color: #14532d; }
  .alert-error   { background: #fef2f2; border: 1.5px solid #ef4444; color: #991b1b; }
  .alert ul { margin: 4px 0 0 16px; }

  .card { background: white; border-radius: 16px; padding: 20px; margin-bottom: 14px; box-shadow: 0 2px 12px rgba(13,74,46,0.07); border: 1.5px solid #e4ebe4; }
  .card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .card-icon { font-size: 1.6rem; }
  .card-title { font-size: 0.9rem; font-weight: 800; color: #0a1628; }
  .card-sub { font-size: 0.72rem; color: #6b7c93; margin-top: 1px; }
  .badge-ok   { display: inline-flex; align-items: center; gap: 4px; background: #f0fdf4; border: 1px solid #22c55e; color: #14532d; padding: 3px 9px; border-radius: 999px; font-size: 0.68rem; font-weight: 700; margin-left: auto; flex-shrink: 0; }
  .badge-miss { display: inline-flex; align-items: center; gap: 4px; background: #fef3c7; border: 1px solid #f59e0b; color: #92400e; padding: 3px 9px; border-radius: 999px; font-size: 0.68rem; font-weight: 700; margin-left: auto; flex-shrink: 0; }

  .file-input-wrap { position: relative; }
  .file-input-wrap input[type=file] {
    width: 100%; padding: 10px 14px;
    border: 2px dashed #e4ebe4; border-radius: 10px;
    background: #f4f8f4; font-size: 0.82rem;
    cursor: pointer; transition: border-color 0.2s;
    font-family: inherit;
  }
  .file-input-wrap input[type=file]:hover { border-color: #16a34a; background: #f0fdf4; }

  .btn {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%; padding: 14px; margin-top: 8px;
    background: linear-gradient(135deg, #0d4a2e, #16a34a);
    color: white; border: none; border-radius: 12px;
    font-size: 0.95rem; font-weight: 800; cursor: pointer;
    font-family: inherit;
    box-shadow: 0 4px 16px rgba(22,163,74,0.4);
    transition: transform 0.15s;
  }
  .btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(22,163,74,0.5); }
  .btn:active { transform: scale(0.98); }

  .warn-box { background: #fffbeb; border: 1.5px solid #f59e0b; border-radius: 10px; padding: 12px 14px; font-size: 0.78rem; color: #92400e; margin-top: 16px; }
  .back-link { display: block; text-align: center; margin-top: 20px; font-size: 0.82rem; color: #16a34a; font-weight: 700; text-decoration: none; }
  .back-link:hover { text-decoration: underline; }
  code { background: #f1f5f9; padding: 1px 6px; border-radius: 4px; font-size: 0.78rem; }
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">
    <div class="logo-icon">&#9851;&#65039;</div>
    <div class="logo-text">Eco<span>Cycle</span></div>
  </div>

  <h1>&#128247; Upload Foto Prototype Mesin</h1>
  <p class="subtitle">Upload 3 foto mesin untuk ditampilkan di halaman Prototype Viewer.<br>Foto akan disimpan otomatis ke <code>assets/img/</code></p>

  <?php if ($success): ?>
  <div class="alert alert-success">
    <strong>&#10003; Berhasil!</strong>
    <ul><?php foreach ($success as $s) echo "<li>$s</li>"; ?></ul>
    <?php if (!$errors && count($success) === 3): ?>
    <div style="margin-top:8px;">Semua foto sudah diupload! <a href="http://localhost/sampah/" style="color:#14532d;font-weight:800;">Buka aplikasi &rarr;</a></div>
    <?php endif; ?>
  </div>
  <?php endif; ?>

  <?php if ($errors): ?>
  <div class="alert alert-error">
    <strong>&#10005; Ada error:</strong>
    <ul><?php foreach ($errors as $e) echo "<li>$e</li>"; ?></ul>
  </div>
  <?php endif; ?>

  <form method="POST" enctype="multipart/form-data">
    <?php foreach ($machines as $key => $info): ?>
    <div class="card">
      <div class="card-header">
        <div class="card-icon"><?= $info['icon'] ?></div>
        <div>
          <div class="card-title"><?= $info['label'] ?></div>
          <div class="card-sub">Simpan sebagai: <code><?= $key ?>.jpg</code></div>
        </div>
        <?php if (isset($existing[$key])): ?>
          <span class="badge-ok">&#10003; <?= $existing[$key] ?></span>
        <?php else: ?>
          <span class="badge-miss">&#9888; Belum ada</span>
        <?php endif; ?>
      </div>
      <div class="file-input-wrap">
        <input type="file" name="<?= $key ?>" accept="image/jpeg,image/png,image/webp">
      </div>
    </div>
    <?php endforeach; ?>

    <button type="submit" class="btn">&#8679; Upload Semua Foto</button>
  </form>

  <div class="warn-box">
    <strong>&#9888;&#65039; Keamanan:</strong> Hapus file <code>upload_proto.php</code> dari server setelah selesai upload untuk mencegah akses tidak sah.
  </div>

  <a href="http://localhost/sampah/" class="back-link">&larr; Kembali ke Aplikasi EcoCycle</a>
</div>
</body>
</html>
