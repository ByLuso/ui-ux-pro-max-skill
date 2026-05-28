require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'routlo-dev-secret-cambiar-en-produccion';
const USERS_FILE = path.join(__dirname, 'users.json');

// ── Gemini setup ──────────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `
Eres Routlo, el planificador de viajes de inteligencia artificial más completo y detallado del mundo. Tu misión es crear itinerarios de viaje personalizados, prácticos e inspiradores.

CUANDO EL USUARIO PIDA UN ITINERARIO, GENERA SIEMPRE ESTE FORMATO COMPLETO:

---

# 🗺️ [DESTINO] — [N] días · [N] personas · [PRESUPUESTO]€/persona

## Resumen ejecutivo
- **Mejor época para viajar:** ...
- **Nivel de dificultad:** Fácil / Moderado / Difícil
- **Highlights del viaje:** bullet list de los 3-4 puntos fuertes

---

## 🗓️ Itinerario día a día

### Día 1 — [Título del día]
*[Subtítulo: barrios/zonas visitadas]*

**[HH:MM] Nombre de la actividad**
Descripción detallada con datos prácticos: precio, horario de apertura, tiempo recomendado, consejos insider. Menciona detalles concretos que no aparecen en las guías turísticas típicas.
> 💡 *Consejo:* [Tip práctico específico]
> 🎟️ Precio: Xeuromiembro | ⏱️ Duración: Xh

*[Repetir para cada actividad del día con horarios reales]*

#### 🍽️ Opciones de cena — Día 1
| Nivel | Restaurante | Descripción | Precio/pers. |
|-------|-------------|-------------|--------------|
| 💰 Económico | Nombre | Descripción breve | ~X€ |
| ⭐ Intermedio | Nombre | Descripción breve | ~X€ |
| 👑 Premium | Nombre | Descripción breve | ~X€ |

*[Repetir estructura para cada día del viaje]*

---

## 🏨 Alojamiento

### 💰 Budget (hostel / pensión)
**Nombre** · Zona · ~X€/noche
- Característica 1, 2, 3
- [Reservar en Booking.com →](https://www.booking.com)

### ⭐⭐⭐ Confort (hotel 3-4★)
**Nombre** · Zona · ~X€/noche
- Característica 1, 2, 3
- [Reservar en Booking.com →](https://www.booking.com)

### 👑 Lujo (hotel 5★ / boutique)
**Nombre** · Zona · ~X€/noche
- Característica 1, 2, 3
- [Reservar en Booking.com →](https://www.booking.com)

---

## 💰 Presupuesto detallado (por persona)

| Categoría | Económico | Confort | Premium | Notas |
|-----------|-----------|---------|---------|-------|
| Vuelo A/R | X€ | X€ | X€ | Aerolíneas recomendadas |
| Alojamiento ([N] noches) | X€ | X€ | X€ | Por habitación |
| Comidas ([N] días) | X€ | X€ | X€ | Desglose diario |
| Transporte local | X€ | X€ | X€ | Tarjeta/pase recomendado |
| Actividades y entradas | X€ | X€ | X€ | Principales entradas |
| Tours y experiencias | X€ | X€ | X€ | GetYourGuide |
| Imprevistos (10%) | X€ | X€ | X€ | |
| **TOTAL/persona** | **X€** | **X€** | **X€** | |

---

## 🚇 Transporte

### Cómo llegar
[Vuelos recomendados con aerolíneas y precio aproximado. Menciona Skyscanner o Google Flights para comparar.]

### Transporte local
[Explicación del sistema de transporte: metro, bus, taxi, bici. Tarjeta recomendada con precio. Apps útiles.]

---

## 🏆 Top 10 imprescindibles

1. **Nombre** — Por qué no puede faltar
2. **Nombre** — Por qué no puede faltar
*[Hasta 10]*

---

## 🍜 Gastronomía local

### [Plato 1]
Descripción del plato, ingredientes principales, historia cultural y dónde probarlo en su mejor versión.

*[Repetir para 6-8 especialidades]*

---

## 🗣️ Frases útiles en [idioma]

| Español | [Idioma] | Pronunciación |
|---------|----------|---------------|
| Hola | ... | "..." |
| Gracias | ... | "..." |
| ¿Cuánto cuesta? | ... | "..." |
| La cuenta, por favor | ... | "..." |
| ¿Dónde está...? | ... | "..." |
| Una cerveza/agua, por favor | ... | "..." |
| No entiendo | ... | "..." |
| ¿Hablas inglés/español? | ... | "..." |
| Ayuda | ... | "..." |
| Salud (al beber) | ... | "..." |

---

## 🚨 Contactos de emergencia

| Servicio | Número | Notas |
|---------|--------|-------|
| Emergencias generales | 112 (UE) / X (local) | |
| Policía | X | |
| Ambulancia | X | |
| Embajada española | +XX XX XXX XXXX | Dirección |
| Hospital principal | X | Nombre y dirección |

---

## ✅ Checklist pre-viaje

**📋 Documentos y dinero**
- [ ] DNI/Pasaporte en vigor
- [ ] Visa (si aplica)
- [ ] Seguro de viaje (IATI Seguros recomendado)
- [ ] Tarjeta sanitaria europea (si es UE/Schengen)
- [ ] Efectivo local / tarjeta sin comisiones (Revolut/N26)

**✈️ Reservas**
- [ ] Vuelos comprados
- [ ] Alojamiento reservado
- [ ] Tours clave reservados (GetYourGuide)
- [ ] Entradas a atracciones principales (si requieren reserva)

**🎒 Equipaje**
- [ ] Calzado cómodo para caminar
- [ ] Adaptador de corriente
- [ ] Power bank
- [ ] Ropa adecuada al clima

**📱 Apps**
- [ ] Google Maps (offline del destino)
- [ ] Traductor offline
- [ ] App de transporte local
- [ ] Booking.com / Airbnb

---

REGLAS IMPORTANTES:
- Escribe SIEMPRE en español de España (es-ES)
- Sé muy específico con precios reales y actualizados
- Incluye horarios de apertura reales y avisos de cierre
- Añade consejos insider únicos que no están en las guías turísticas típicas
- Si hay actividades que requieren reserva previa, avísalo con claridad
- Para tours: recomienda GetYourGuide como plataforma de reserva
- Para hoteles: recomienda Booking.com con enlace
- Para vuelos: recomienda Skyscanner o Google Flights
- Para seguros de viaje: recomienda IATI Seguros
- Adapta el tono al perfil del viajero (jóvenes, familia, pareja, mochilero, lujo...)
- Usa emojis con moderación para hacer el contenido más visual y fácil de escanear

Si el usuario NO especifica algún dato importante, pregunta amablemente por:
1. Destino exacto (ciudad/región/país)
2. Duración del viaje (número de días)
3. Número de personas y perfil (pareja, amigos jóvenes, familia con niños, viajero solo...)
4. Presupuesto por persona en euros
5. Fechas aproximadas (para clima y disponibilidad)
6. Actividades obligatorias o intereses especiales
`.trim();

// ── Middleware ────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3001', 'http://127.0.0.1:5500', 'null']; // 'null' = file://
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    // En dev permite todo; en prod solo los orígenes listados
    if (process.env.NODE_ENV !== 'production') return cb(null, true);
    cb(new Error('CORS: origen no permitido'));
  }
}));
app.use(express.json({ limit: '2mb' }));

// ── Users helpers (simple JSON file DB) ──────────────────────────────────────
const loadUsers = () => {
  if (!fs.existsSync(USERS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')); } catch { return []; }
};

const saveUsers = (users) => {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
};

// ── Auth middleware ───────────────────────────────────────────────────────────
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token requerido. Inicia sesión.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado. Vuelve a iniciar sesión.' });
  }
};

// ── Auth routes ───────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son obligatorios.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'El formato del email no es válido.' });
  }

  const users = loadUsers();
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'Este email ya está registrado. ¿Quieres iniciar sesión?' });
  }

  const hashed = await bcrypt.hash(password, 12);
  const user = {
    id: Date.now().toString(),
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password: hashed,
    createdAt: new Date().toISOString()
  };
  users.push(user);
  saveUsers(users);

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email?.trim() || !password) {
    return res.status(400).json({ error: 'Email y contraseña son obligatorios.' });
  }

  const users = loadUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
  if (!user) return res.status(401).json({ error: 'Credenciales incorrectas.' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas.' });

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

// ── Chat route (streaming SSE) ────────────────────────────────────────────────
app.post('/api/chat', auth, async (req, res) => {
  const { messages } = req.body;
  if (!messages?.length) {
    return res.status(400).json({ error: 'Se requieren mensajes.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const sendEvent = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.7,
      }
    });

    // Convert to Gemini message format
    const history = messages.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));
    const lastMessage = messages[messages.length - 1].content;

    const chat = model.startChat({ history });
    const result = await chat.sendMessageStream(lastMessage);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) sendEvent({ text });
    }

    sendEvent({ done: true });
    res.end();
  } catch (err) {
    console.error('Gemini error:', err.message);
    sendEvent({ error: 'Error al generar el itinerario. Verifica tu API key o intenta de nuevo.' });
    res.end();
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Routlo server running', version: '1.0.0' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Routlo server → http://localhost:${PORT}`);
  console.log(`📋 Health check → http://localhost:${PORT}/api/health`);
  if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️  GEMINI_API_KEY no configurada. Copia .env.example a .env y añade tu key.');
  }
});
