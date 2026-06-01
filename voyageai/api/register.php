<?php
require 'config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond(['error' => 'Método no permitido'], 405);

$body = body();
$name  = trim($body['name'] ?? '');
$email = trim($body['email'] ?? '');
$pass  = $body['password'] ?? '';

// Validaciones
if (!$name || strlen($name) < 2)
    respond(['error' => 'El nombre es obligatorio'], 400);
if (!filter_var($email, FILTER_VALIDATE_EMAIL))
    respond(['error' => 'Email no válido'], 400);
if (strlen($pass) < 8)
    respond(['error' => 'La contraseña debe tener al menos 8 caracteres'], 400);

$hash = password_hash($pass, PASSWORD_BCRYPT, ['cost' => 12]);

try {
    db()->prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)')
       ->execute([$name, $email, $hash]);
} catch (PDOException $e) {
    if ($e->getCode() === '23000')
        respond(['error' => 'Este email ya está registrado'], 409);
    respond(['error' => 'Error del servidor'], 500);
}

// Crear sesión automáticamente tras registro
$uid   = (int) db()->lastInsertId();
$token = bin2hex(random_bytes(32));
$exp   = date('Y-m-d H:i:s', strtotime('+30 days'));
db()->prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
   ->execute([$token, $uid, $exp]);

respond([
    'ok'    => true,
    'token' => $token,
    'user'  => ['id' => $uid, 'name' => $name, 'email' => $email]
], 201);
