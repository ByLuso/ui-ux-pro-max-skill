<?php
require 'config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond(['error' => 'Método no permitido'], 405);

$body  = body();
$email = trim($body['email'] ?? '');
$pass  = $body['password'] ?? '';

if (!$email || !$pass) respond(['error' => 'Email y contraseña requeridos'], 400);

$stmt = db()->prepare('SELECT id, name, email, password FROM users WHERE email = ?');
$stmt->execute([$email]);
$user = $stmt->fetch();

if (!$user || !password_verify($pass, $user['password']))
    respond(['error' => 'Email o contraseña incorrectos'], 401);

// Limpiar sesiones antiguas del usuario
db()->prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at < NOW()')
   ->execute([$user['id']]);

// Crear nueva sesión
$token = bin2hex(random_bytes(32));
$exp   = date('Y-m-d H:i:s', strtotime('+30 days'));
db()->prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
   ->execute([$token, $user['id'], $exp]);

respond([
    'ok'    => true,
    'token' => $token,
    'user'  => ['id' => $user['id'], 'name' => $user['name'], 'email' => $user['email']]
]);
