<?php
/**
 * Ejecuta este archivo UNA SOLA VEZ para crear las tablas.
 * URL: https://routlo.com/api/setup.php?key=ROUTLO_SETUP_2026
 * Luego BÓRRALO o renómbralo.
 */
require 'config.php';

if (($_GET['key'] ?? '') !== 'ROUTLO_SETUP_2026') {
    respond(['error' => 'Forbidden'], 403);
}

$sql = "
CREATE TABLE IF NOT EXISTS users (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(100) NOT NULL,
    email      VARCHAR(150) NOT NULL UNIQUE,
    password   VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
    id         VARCHAR(64) PRIMARY KEY,
    user_id    INT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS itinerarios (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    user_id      INT NOT NULL,
    titulo       VARCHAR(200) NOT NULL,
    destino      VARCHAR(150) NOT NULL,
    dias         TINYINT NOT NULL DEFAULT 5,
    presupuesto  VARCHAR(50),
    contenido    JSON NOT NULL,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
";

try {
    db()->exec($sql);
    respond(['ok' => true, 'message' => 'Tablas creadas. BORRA este archivo ahora.']);
} catch (Exception $e) {
    respond(['error' => $e->getMessage()], 500);
}
