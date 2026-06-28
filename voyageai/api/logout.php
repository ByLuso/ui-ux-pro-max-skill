<?php
require 'config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond(['error' => 'Método no permitido'], 405);

$header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$token  = str_replace('Bearer ', '', $header);

if ($token) {
    db()->prepare('DELETE FROM sessions WHERE id = ?')->execute([$token]);
}

respond(['ok' => true]);
