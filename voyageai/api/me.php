<?php
require 'config.php';

$uid  = auth_user();
$stmt = db()->prepare('SELECT id, name, email, created_at FROM users WHERE id = ?');
$stmt->execute([$uid]);
respond($stmt->fetch());
