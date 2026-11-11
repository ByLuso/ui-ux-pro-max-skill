<?php
require 'config.php';

$method = $_SERVER['REQUEST_METHOD'];
$uid    = auth_user();

// GET — listar itinerarios del usuario
if ($method === 'GET') {
    $stmt = db()->prepare(
        'SELECT id, titulo, destino, dias, presupuesto, created_at
         FROM itinerarios WHERE user_id = ? ORDER BY created_at DESC'
    );
    $stmt->execute([$uid]);
    respond($stmt->fetchAll());
}

// POST — guardar nuevo itinerario
if ($method === 'POST') {
    $body = body();
    $titulo     = trim($body['titulo'] ?? '');
    $destino    = trim($body['destino'] ?? '');
    $dias       = (int) ($body['dias'] ?? 5);
    $presupuesto = trim($body['presupuesto'] ?? '');
    $contenido  = $body['contenido'] ?? [];

    if (!$titulo || !$destino)
        respond(['error' => 'Título y destino son obligatorios'], 400);

    db()->prepare(
        'INSERT INTO itinerarios (user_id, titulo, destino, dias, presupuesto, contenido)
         VALUES (?, ?, ?, ?, ?, ?)'
    )->execute([$uid, $titulo, $destino, $dias, $presupuesto, json_encode($contenido, JSON_UNESCAPED_UNICODE)]);

    respond(['ok' => true, 'id' => (int) db()->lastInsertId()], 201);
}

// DELETE — eliminar itinerario
if ($method === 'DELETE') {
    $id = (int) ($_GET['id'] ?? 0);
    if (!$id) respond(['error' => 'ID requerido'], 400);

    db()->prepare('DELETE FROM itinerarios WHERE id = ? AND user_id = ?')
       ->execute([$id, $uid]);
    respond(['ok' => true]);
}

respond(['error' => 'Método no permitido'], 405);
