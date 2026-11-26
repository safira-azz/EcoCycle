-- ============================================================
-- EcoCycle Database Schema v2.1
-- Database target: sampah  (sudah dibuat di XAMPP)
-- Import: mysql -u root sampah < db/ecocycle.sql
-- Atau via phpMyAdmin: pilih database "sampah" → Import
-- ============================================================


SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = '';

-- ── ROLES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `roles` (
  `id`          TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name`        VARCHAR(50)  UNIQUE NOT NULL,
  `description` VARCHAR(200)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── USERS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `users` (
  `id`                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `role_id`           TINYINT UNSIGNED NOT NULL DEFAULT 3,
  `name`              VARCHAR(100)  NOT NULL,
  `email`             VARCHAR(150)  UNIQUE NOT NULL,
  `phone`             VARCHAR(20),
  `password`          VARCHAR(255)  NOT NULL,
  `profile_image`     VARCHAR(255),
  `eco_points`        INT UNSIGNED  DEFAULT 0,
  `level`             VARCHAR(50)   DEFAULT 'Eco Starter',
  `total_scans`       INT UNSIGNED  DEFAULT 0,
  `waste_contributed` DECIMAL(10,2) DEFAULT 0.00,
  `status`            ENUM('active','inactive','suspended') DEFAULT 'active',
  `created_at`        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── WASTE CATEGORIES ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS `waste_categories` (
  `id`               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name`             VARCHAR(100) NOT NULL,
  `slug`             VARCHAR(100) UNIQUE NOT NULL,
  `type`             ENUM('organic','non-organic','hazardous','residual') NOT NULL,
  `main_category`    ENUM('ORGANIK','NON-ORGANIK','B3','RESIDU') NOT NULL DEFAULT 'RESIDU',
  `processing_route` VARCHAR(100),
  `color`            VARCHAR(20),
  `icon`             VARCHAR(50),
  `description`      TEXT,
  `points_per_kg`    DECIMAL(5,2) DEFAULT 10.00,
  `is_active`        TINYINT(1)   DEFAULT 1,
  `created_at`       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── WASTE SCANS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `waste_scans` (
  `id`                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `scan_id`              VARCHAR(50)  UNIQUE NOT NULL,
  `user_id`              INT UNSIGNED NOT NULL,
  `image_path`           VARCHAR(255),
  `waste_name`           VARCHAR(100),
  `category_id`          INT UNSIGNED,
  `material`             VARCHAR(100),
  `confidence`           DECIMAL(5,2),
  `confidence_level`     ENUM('high','low','unknown') DEFAULT 'unknown',
  `recommendation`       VARCHAR(200),
  `processing_route`     VARCHAR(100),
  `pct_organic`          DECIMAL(5,2) DEFAULT 0,
  `pct_non_organic`      DECIMAL(5,2) DEFAULT 0,
  `pct_hazardous`        DECIMAL(5,2) DEFAULT 0,
  `pct_residual`         DECIMAL(5,2) DEFAULT 0,
  `is_feedback_given`    TINYINT(1)   DEFAULT 0,
  `feedback_category_id` INT UNSIGNED,
  `status`               ENUM('pending','processed','rejected') DEFAULT 'pending',
  `created_at`           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_user`    (`user_id`),
  INDEX `idx_created` (`created_at`),
  FOREIGN KEY (`user_id`)     REFERENCES `users`(`id`)            ON DELETE CASCADE,
  FOREIGN KEY (`category_id`) REFERENCES `waste_categories`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── AI PREDICTIONS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ai_predictions` (
  `id`                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `scan_id`            VARCHAR(50)  NOT NULL,
  `model_name`         VARCHAR(100) DEFAULT 'MobileNetV3',
  `model_version`      VARCHAR(50)  DEFAULT 'v1.0.0-prototype',
  `dataset_version`    VARCHAR(50)  DEFAULT 'TrashNet+TACO-v1',
  `top_class`          VARCHAR(100),
  `confidence`         DECIMAL(5,2),
  `raw_prediction`     JSON,
  `processing_time_ms` INT UNSIGNED,
  `is_simulation`      TINYINT(1)   DEFAULT 1,
  `created_at`         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_scan` (`scan_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── AI FEEDBACK ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ai_feedback` (
  `id`                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `scan_id`             VARCHAR(50)  NOT NULL,
  `user_id`             INT UNSIGNED NOT NULL,
  `predicted_class`     VARCHAR(100),
  `correct_category_id` INT UNSIGNED,
  `notes`               TEXT,
  `validation_status`   ENUM('pending','validated','rejected') DEFAULT 'pending',
  `created_at`          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`)             REFERENCES `users`(`id`)            ON DELETE CASCADE,
  FOREIGN KEY (`correct_category_id`) REFERENCES `waste_categories`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── WASTE PROCESSING ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS `waste_processing` (
  `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `scan_id`         VARCHAR(50),
  `user_id`         INT UNSIGNED,
  `category_id`     INT UNSIGNED,
  `weight_kg`       DECIMAL(8,2) DEFAULT 0.00,
  `processing_type` ENUM('biodigester','recycling','pyrolysis','special','residual') NOT NULL,
  `device_id`       VARCHAR(100),
  `batch_id`        VARCHAR(50),
  `status`          ENUM('queued','sorting','processing','completed','failed') DEFAULT 'queued',
  `processed_at`    TIMESTAMP NULL,
  `created_at`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_user`   (`user_id`),
  INDEX `idx_status` (`status`),
  FOREIGN KEY (`user_id`)     REFERENCES `users`(`id`)            ON DELETE SET NULL,
  FOREIGN KEY (`category_id`) REFERENCES `waste_categories`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── IoT DEVICES ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `iot_devices` (
  `id`               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `device_id`        VARCHAR(100) UNIQUE NOT NULL,
  `device_key`       VARCHAR(64)  NOT NULL COMMENT 'SHA256 hashed',
  `name`             VARCHAR(100),
  `type`             ENUM('biodigester','pyrolysis','sorting','general') NOT NULL,
  `location`         VARCHAR(200),
  `status`           ENUM('online','offline','warning','maintenance') DEFAULT 'offline',
  `last_seen`        TIMESTAMP NULL,
  `firmware_version` VARCHAR(50),
  `ip_address`       VARCHAR(50),
  `is_active`        TINYINT(1)   DEFAULT 1,
  `created_at`       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── IoT SENSOR DATA ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `iot_sensor_data` (
  `id`          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `device_id`   VARCHAR(100) NOT NULL,
  `sensor_type` VARCHAR(50)  NOT NULL,
  `value`       DECIMAL(12,4) NOT NULL,
  `unit`        VARCHAR(20),
  `status`      ENUM('normal','warning','critical') DEFAULT 'normal',
  `timestamp`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_device_time` (`device_id`,`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── BIODIGESTERS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `biodigesters` (
  `id`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `device_id`  VARCHAR(100) UNIQUE NOT NULL,
  `name`       VARCHAR(100),
  `capacity_l` DECIMAL(8,2),
  `location`   VARCHAR(200),
  `status`     ENUM('active','inactive','maintenance') DEFAULT 'active',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`device_id`) REFERENCES `iot_devices`(`device_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── BIODIGESTER READINGS ───────────────────────────────────
CREATE TABLE IF NOT EXISTS `biodigester_readings` (
  `id`                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `device_id`           VARCHAR(100) NOT NULL,
  `temperature`         DECIMAL(5,2),
  `ph_level`            DECIMAL(4,2),
  `pressure`            DECIMAL(6,3),
  `volume`              DECIMAL(8,2),
  `fermentation_day`    SMALLINT UNSIGNED DEFAULT 0,
  `fermentation_total`  SMALLINT UNSIGNED DEFAULT 21,
  `biogas_volume`       DECIMAL(8,3),
  `gas_production_rate` DECIMAL(6,3),
  `organic_input_kg`    DECIMAL(8,2) DEFAULT 0.00,
  `process_status`      ENUM('idle','fermenting','optimal','needs_attention','completed') DEFAULT 'idle',
  `is_simulation`       TINYINT(1)   DEFAULT 1,
  `timestamp`           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_device_time` (`device_id`,`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── PYROLYSIS UNITS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `pyrolysis_units` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `device_id`   VARCHAR(100) UNIQUE NOT NULL,
  `name`        VARCHAR(100),
  `capacity_kg` DECIMAL(8,2),
  `location`    VARCHAR(200),
  `status`      ENUM('active','inactive','maintenance') DEFAULT 'active',
  `created_at`  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`device_id`) REFERENCES `iot_devices`(`device_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── PYROLYSIS BATCHES ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS `pyrolysis_batches` (
  `id`                     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `batch_id`               VARCHAR(50) UNIQUE NOT NULL,
  `device_id`              VARCHAR(100),
  `input_weight_kg`        DECIMAL(8,2),
  `input_material`         VARCHAR(100),
  `oil_volume_liters`      DECIMAL(8,3),
  `gas_volume_m3`          DECIMAL(8,3),
  `residue_kg`             DECIMAL(8,2),
  `oil_yield_percent`      DECIMAL(5,2),
  `energy_consumption_kwh` DECIMAL(8,3),
  `process_stability`      DECIMAL(5,2),
  `performance_score`      DECIMAL(5,2),
  `status`                 ENUM('idle','heating','running','cooling','completed','failed') DEFAULT 'idle',
  `is_simulation`          TINYINT(1)  DEFAULT 1,
  `started_at`             TIMESTAMP NULL,
  `completed_at`           TIMESTAMP NULL,
  `created_at`             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── PYROLYSIS READINGS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS `pyrolysis_readings` (
  `id`                     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `batch_id`               VARCHAR(50),
  `device_id`              VARCHAR(100),
  `reactor_temp`           DECIMAL(6,2),
  `heater_temp`            DECIMAL(6,2),
  `reactor_pressure`       DECIMAL(6,3),
  `condenser_temp`         DECIMAL(6,2),
  `heating_duration_min`   SMALLINT UNSIGNED DEFAULT 0,
  `cooling_status`         TINYINT(1) DEFAULT 0,
  `energy_consumption_kwh` DECIMAL(8,3),
  `is_simulation`          TINYINT(1) DEFAULT 1,
  `timestamp`              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_batch_time` (`batch_id`,`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── ENERGY OUTPUTS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `energy_outputs` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `source`      ENUM('biodigester','pyrolysis') NOT NULL,
  `device_id`   VARCHAR(100),
  `batch_id`    VARCHAR(50),
  `energy_type` ENUM('biogas','pyrolysis_oil','gas','other') NOT NULL,
  `amount`      DECIMAL(10,4) NOT NULL,
  `unit`        VARCHAR(20),
  `date`        DATE NOT NULL,
  `created_at`  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_source_date` (`source`,`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── ECO POINTS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `eco_points` (
  `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id`       INT UNSIGNED NOT NULL,
  `points`        INT          NOT NULL,
  `activity_type` ENUM('welcome','scan','contribution','sorting','verified','redeem','admin_adjust') NOT NULL,
  `description`   VARCHAR(255),
  `reference_id`  VARCHAR(100),
  `created_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_user` (`user_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── REWARDS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `rewards` (
  `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name`            VARCHAR(100) NOT NULL,
  `description`     TEXT,
  `points_required` INT UNSIGNED NOT NULL,
  `reward_type`     ENUM('voucher','donation','merchandise','certificate','other') DEFAULT 'other',
  `value`           VARCHAR(100),
  `stock`           INT DEFAULT -1 COMMENT '-1 = unlimited',
  `is_active`       TINYINT(1)   DEFAULT 1,
  `image`           VARCHAR(255),
  `created_at`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── REWARD REDEMPTIONS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS `reward_redemptions` (
  `id`           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id`      INT UNSIGNED NOT NULL,
  `reward_id`    INT UNSIGNED NOT NULL,
  `points_spent` INT UNSIGNED NOT NULL,
  `status`       ENUM('pending','approved','rejected','claimed') DEFAULT 'pending',
  `created_at`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_user` (`user_id`),
  FOREIGN KEY (`user_id`)   REFERENCES `users`(`id`)   ON DELETE CASCADE,
  FOREIGN KEY (`reward_id`) REFERENCES `rewards`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── NOTIFICATIONS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `notifications` (
  `id`             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id`        INT UNSIGNED NULL COMMENT 'NULL = broadcast',
  `type`           ENUM('sensor_warning','process_warning','production_update','reward','system','critical') NOT NULL,
  `title`          VARCHAR(200) NOT NULL,
  `message`        TEXT NOT NULL,
  `is_read`        TINYINT(1)   DEFAULT 0,
  `reference_type` VARCHAR(50),
  `reference_id`   VARCHAR(100),
  `created_at`     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_user_read` (`user_id`,`is_read`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── ECO LOCATIONS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `eco_locations` (
  `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name`            VARCHAR(200) NOT NULL,
  `type`            ENUM('collection_point','recycling','biodigester','pyrolysis','facility','user_contribution') NOT NULL,
  `latitude`        DECIMAL(10,8) NOT NULL,
  `longitude`       DECIMAL(11,8) NOT NULL,
  `address`         TEXT,
  `description`     TEXT,
  `operating_hours` VARCHAR(100),
  `status`          ENUM('active','prototype','inactive') DEFAULT 'prototype',
  `is_active`       TINYINT(1)   DEFAULT 1,
  `created_at`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── SYSTEM SETTINGS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `system_settings` (
  `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `setting_key`   VARCHAR(100) UNIQUE NOT NULL,
  `setting_value` TEXT,
  `setting_type`  ENUM('string','number','boolean','json') DEFAULT 'string',
  `description`   VARCHAR(255),
  `updated_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── SYSTEM LOGS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `system_logs` (
  `id`          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id`     INT UNSIGNED NULL,
  `action`      VARCHAR(100),
  `description` TEXT,
  `ip_address`  VARCHAR(50),
  `user_agent`  TEXT,
  `created_at`  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_action`  (`action`),
  INDEX `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- SEED DATA
-- ============================================================

INSERT IGNORE INTO `roles` (`id`,`name`,`description`) VALUES
  (1,'admin',    'Full system access'),
  (2,'operator', 'IoT and processing management'),
  (3,'user',     'Standard mobile app user');

INSERT IGNORE INTO `waste_categories`
  (`id`,`name`,`slug`,`type`,`main_category`,`processing_route`,`color`,`icon`,`description`,`points_per_kg`)
VALUES
  (1,'Sampah Organik',    'organic',          'organic',     'ORGANIK',     'biodigester',         '#22c55e','leaf',           'Sisa makanan, sampah kebun, bahan biodegradable',      15.00),
  (2,'Plastik Daur Ulang','plastic',          'non-organic', 'NON-ORGANIK', 'recycling',           '#3b82f6','recycle',        'PET, HDPE — plastik kualitas daur ulang',              12.00),
  (3,'Kertas & Karton',   'paper',            'non-organic', 'NON-ORGANIK', 'recycling',           '#f59e0b','file',           'Kertas, kardus, koran',                                8.00),
  (4,'Logam',             'metal',            'non-organic', 'NON-ORGANIK', 'recycling',           '#6b7280','cog',            'Aluminium, baja, besi',                               20.00),
  (5,'Kaca',              'glass',            'non-organic', 'NON-ORGANIK', 'recycling',           '#06b6d4','circle',         'Botol kaca, toples kaca',                             10.00),
  (6,'Plastik Pirolisis', 'pyrolysis-plastic','non-organic', 'NON-ORGANIK', 'pyrolysis',           '#8b5cf6','zap',            'PE, PP — cocok sebagai bahan baku pirolisis',          18.00),
  (7,'Limbah B3',         'hazardous',        'hazardous',   'B3',          'special_handling',    '#ef4444','alert-triangle','Baterai, bahan kimia, limbah medis, e-waste',           5.00),
  (8,'Sampah Residu',     'residual',         'residual',    'RESIDU',      'residual_management', '#9ca3af','trash',          'Sampah campuran yang tidak dapat diklasifikasi',        2.00);

INSERT IGNORE INTO `iot_devices` (`device_id`,`device_key`,`name`,`type`,`location`,`status`,`firmware_version`) VALUES
  ('BD-001', SHA2('BD-001-secret-key-ecocycle',256), 'Smart Biodigester Unit 1', 'biodigester', ' Gresik', 'online', 'v2.1.0'),
  ('PY-001', SHA2('PY-001-secret-key-ecocycle',256), 'Smart Pyrolysis Unit 1',   'pyrolysis',   ' Gresik', 'online', 'v1.8.3'),
  ('ST-001', SHA2('ST-001-secret-key-ecocycle',256), 'Smart Sorting Belt 1',     'sorting',     ' Gresik', 'online', 'v1.2.1');

INSERT IGNORE INTO `biodigesters` (`device_id`,`name`,`capacity_l`,`location`,`status`) VALUES
  ('BD-001','Smart Biodigester Unit 1',80.00,' Gresik','active');

INSERT IGNORE INTO `pyrolysis_units` (`device_id`,`name`,`capacity_kg`,`location`,`status`) VALUES
  ('PY-001','Smart Pyrolysis Unit 1',15.00,' Gresik','active');

INSERT IGNORE INTO `eco_locations` (`name`,`type`,`latitude`,`longitude`,`address`,`description`,`operating_hours`,`status`) VALUES
  ('EcoCycle Main Facility',    'facility',        -7.19860000,112.65270000,' Gresik, Jawa Timur',      'Fasilitas pengolahan sampah utama',                    'Sen-Sab 07:00-17:00','prototype'),
  ('Gresik Collection Point A', 'collection_point',-7.20100000,112.65100000,'Jl. Gresik',         'Titik pengumpulan sampah utama',                       'Setiap hari 06:00-18:00','prototype'),
  ('Gresik Recycling Center',   'recycling',       -7.19700000,112.65450000,'Kawasan Industri Gresik', 'Fasilitas daur ulang dan pemilahan',                   'Sen-Jum 08:00-16:00','prototype'),
  ('Smart Biodigester BD-001',  'biodigester',     -7.19860000,112.65270000,'EcoCycle Facility, Gresik',       'Unit digesti anaerobik untuk sampah organik',          '24/7 Automated','prototype'),
  ('Smart Pyrolysis PY-001',    'pyrolysis',       -7.19900000,112.65300000,'EcoCycle Facility, Gresik',       'Unit pirolisis untuk konversi plastik ke minyak',      'Sen-Sab 08:00-20:00','prototype'),
  ('Pengelola Limbah B3',       'facility',        -7.18500000,112.63000000,'Gresik, Jawa Timur',              'Fasilitas pengelolaan limbah B3 bersertifikasi KLHK',  'Sen-Jum 08:00-16:00','active');

INSERT IGNORE INTO `system_settings` (`setting_key`,`setting_value`,`setting_type`,`description`) VALUES
  ('app_name',           'EcoCycle',         'string',  'Nama aplikasi'),
  ('ai_confidence_high', '85',               'number',  'Threshold confidence tinggi (%)'),
  ('ai_confidence_low',  '60',               'number',  'Threshold confidence rendah (%)'),
  ('ai_model_version',   'v1.0.0-prototype', 'string',  'Versi model AI'),
  ('ai_model_name',      'MobileNetV3',      'string',  'Arsitektur model AI'),
  ('ai_dataset_version', 'TrashNet+TACO-v1', 'string',  'Versi dataset training'),
  ('simulation_mode',    '1',                'boolean', 'Mode simulasi prototype'),
  ('points_per_scan',    '5',                'number',  'Poin per scan sampah'),
  ('points_per_kg',      '10',               'number',  'Poin dasar per kg sampah');

INSERT IGNORE INTO `rewards` (`id`,`name`,`description`,`points_required`,`reward_type`,`value`,`stock`) VALUES
  (1,'Eco Voucher 10K',         'Voucher belanja Rp 10.000 di mitra EcoCycle', 500,  'voucher',     'Rp 10.000', 100),
  (2,'Eco Voucher 25K',         'Voucher belanja Rp 25.000 di mitra EcoCycle', 1200, 'voucher',     'Rp 25.000',  50),
  (3,'Tanam Satu Pohon',        'Donasi penanaman 1 pohon atas nama Anda',      300,  'donation',    '1 Pohon',    -1),
  (4,'Eco Bag',                 'Tas belanja ramah lingkungan EcoCycle',         800,  'merchandise', 'Eco Bag',    30),
  (5,'Sertifikat Carbon Offset','Sertifikat offset karbon 10 kg CO₂',           1000, 'certificate', '10 kg CO2',  -1);

-- Admin user (password: Admin@123)
INSERT IGNORE INTO `users` (`id`,`role_id`,`name`,`email`,`phone`,`password`,`status`,`level`) VALUES
  (1, 1, 'Admin EcoCycle', 'admin@ecocycle.id', '081234567890',
   '$2y$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMqJqhN8/LewdBpj2sBxnmfxKi',
   'active', 'Administrator');

-- Demo user (password: Demo@1234)
INSERT IGNORE INTO `users` (`id`,`role_id`,`name`,`email`,`phone`,`password`,`status`,`eco_points`,`level`,`total_scans`) VALUES
  (2, 3, 'Demo User', 'demo@ecocycle.id', '082345678901',
   '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
   'active', 150, 'Eco Learner', 3);

INSERT IGNORE INTO `eco_points` (`user_id`,`points`,`activity_type`,`description`) VALUES
  (2, 50,  'welcome',      'Selamat datang di EcoCycle!'),
  (2, 5,   'scan',         'Scan sampah selesai'),
  (2, 5,   'scan',         'Scan sampah selesai'),
  (2, 5,   'scan',         'Scan sampah selesai'),
  (2, 85,  'contribution', 'Kontribusi sampah terverifikasi');

INSERT IGNORE INTO `notifications` (`user_id`,`type`,`title`,`message`) VALUES
  (NULL, 'production_update', 'Update Produksi Biogas',  'Produksi biogas meningkat 12% hari ini. Output saat ini: 2.4 m³.'),
  (NULL, 'system',            'Sistem Online',           'Sistem prototype EcoCycle aktif. Mode simulasi berjalan.'),
  (2,    'reward',            'Poin Didapat!',           'Kamu mendapatkan 5 Eco Points dari scan sampah terakhir.');

INSERT IGNORE INTO `pyrolysis_batches`
  (`batch_id`,`device_id`,`input_weight_kg`,`input_material`,`oil_volume_liters`,`gas_volume_m3`,`residue_kg`,`oil_yield_percent`,`energy_consumption_kwh`,`process_stability`,`performance_score`,`status`,`is_simulation`,`started_at`,`completed_at`)
VALUES
  ('BATCH-20241201-028','PY-001',10.0,'PE/PP Mixed',5.1,1.2,0.8,51.0,12.4,95.0,91.0,'completed',1,DATE_SUB(NOW(),INTERVAL 3  HOUR),DATE_SUB(NOW(),INTERVAL 1  HOUR)),
  ('BATCH-20241130-027','PY-001',12.0,'HDPE',       6.2,1.5,0.9,51.7,14.1,93.0,89.0,'completed',1,DATE_SUB(NOW(),INTERVAL 27 HOUR),DATE_SUB(NOW(),INTERVAL 25 HOUR)),
  ('BATCH-20241129-026','PY-001', 8.0,'PP',         3.9,0.9,0.6,48.8,10.2,91.0,87.0,'completed',1,DATE_SUB(NOW(),INTERVAL 51 HOUR),DATE_SUB(NOW(),INTERVAL 49 HOUR));

INSERT IGNORE INTO `energy_outputs` (`source`,`device_id`,`batch_id`,`energy_type`,`amount`,`unit`,`date`) VALUES
  ('biodigester','BD-001',NULL,                'biogas',        2.4,'m³',CURDATE()),
  ('biodigester','BD-001',NULL,                'biogas',        2.2,'m³',DATE_SUB(CURDATE(),INTERVAL 1 DAY)),
  ('biodigester','BD-001',NULL,                'biogas',        2.5,'m³',DATE_SUB(CURDATE(),INTERVAL 2 DAY)),
  ('pyrolysis',  'PY-001','BATCH-20241201-028','pyrolysis_oil', 5.1,'L', CURDATE()),
  ('pyrolysis',  'PY-001','BATCH-20241130-027','pyrolysis_oil', 6.2,'L', DATE_SUB(CURDATE(),INTERVAL 1 DAY)),
  ('pyrolysis',  'PY-001','BATCH-20241129-026','pyrolysis_oil', 3.9,'L', DATE_SUB(CURDATE(),INTERVAL 2 DAY));
