import React, {
  useState,
  useReducer,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  Wrench,
  Printer,
  Layers,
  Sparkles,
  Star,
  Camera,
  Clock,
  AlertTriangle,
  Plus,
  X,
  Search,
  Trash2,
  Link as LinkIcon,
  Upload,
  ChevronDown,
  Loader2,
  AlertCircle,
  Ruler,
  Gauge,
  Image as ImageIcon,
  RotateCcw,
  FileBox,
  PencilLine,
  CheckCircle2,
  SlidersHorizontal,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Constantes y utilidades                                            */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "taller3d_proyectos_v1";

const MATERIALES = ["PLA", "PETG", "ABS", "TPU", "Resina"];

const PRIORIDADES = [
  { id: "baja", label: "Baja", clase: "text-zinc-400 border-zinc-600 bg-zinc-800/60" },
  { id: "media", label: "Media", clase: "text-cyan-400 border-cyan-600 bg-cyan-950/40" },
  { id: "alta", label: "Alta", clase: "text-orange-400 border-orange-600 bg-orange-950/40" },
];

const ESTADOS = [
  { id: "pendiente", label: "Pendiente", icon: Clock },
  { id: "en_cola", label: "En cola", icon: Layers },
  { id: "imprimiendo", label: "Imprimiendo", icon: Printer },
  { id: "post_procesado", label: "Post-procesado", icon: Wrench },
  { id: "completado", label: "Completado", icon: CheckCircle2 },
];

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function formatearFecha(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function comprimirImagen(file, maxLado = 1200, calidad = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.onload = (evento) => {
      const img = new Image();
      img.onerror = () => reject(new Error("No se pudo procesar la imagen"));
      img.onload = () => {
        let { width, height } = img;
        if (width >= height && width > maxLado) {
          height = Math.round((height * maxLado) / width);
          width = maxLado;
        } else if (height > width && height > maxLado) {
          width = Math.round((width * maxLado) / height);
          height = maxLado;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", calidad));
      };
      img.src = evento.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function esImagen(file) {
  return file && file.type && file.type.startsWith("image/");
}

function esUrlValida(texto) {
  if (!texto) return false;
  try {
    const url = new URL(texto);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function cargarProyectosDesdeStorage() {
  try {
    const crudo = window.localStorage.getItem(STORAGE_KEY);
    if (!crudo) return [];
    const datos = JSON.parse(crudo);
    if (!Array.isArray(datos)) return [];
    return datos;
  } catch (error) {
    console.error("taller3d: no se pudo leer localStorage, se arranca con lista vacía", error);
    return [];
  }
}

function guardarProyectosEnStorage(proyectos) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(proyectos));
  } catch (error) {
    console.error("taller3d: no se pudo guardar en localStorage", error);
  }
}

/* ------------------------------------------------------------------ */
/* Reducer                                                             */
/* ------------------------------------------------------------------ */

function proyectosReducer(state, accion) {
  switch (accion.type) {
    case "CARGAR":
      return accion.payload;

    case "CREAR":
      return [accion.payload, ...state];

    case "ACTUALIZAR":
      return state.map((p) => (p.id === accion.id ? { ...p, ...accion.cambios } : p));

    case "CAMBIAR_ESTADO":
      return state.map((p) =>
        p.id === accion.id
          ? {
              ...p,
              estado: accion.estado,
              historico: [...p.historico, { estado: accion.estado, fecha: new Date().toISOString() }],
            }
          : p
      );

    case "ELIMINAR":
      return state.filter((p) => p.id !== accion.id);

    case "SET_FICHA_IA":
      return state.map((p) => (p.id === accion.id ? { ...p, fichaIA: accion.ficha } : p));

    case "AÑADIR_FOTO":
      return state.map((p) =>
        p.id === accion.id ? { ...p, [accion.campo]: [...p[accion.campo], ...accion.fotos] } : p
      );

    default:
      return state;
  }
}

/* ------------------------------------------------------------------ */
/* Llamada a IA                                                        */
/* ------------------------------------------------------------------ */

function construirPrompt(datos) {
  return `Eres un experto en impresión 3D FDM y de resina. A partir de estos datos de un proyecto,
genera una ficha técnica. Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional,
sin explicaciones, sin bloques de código markdown. El JSON debe tener exactamente estas claves:

{
  "especificacionesSugeridas": "string: relleno %, altura de capa, soportes recomendados, orientación de impresión, resumen en 2-3 frases",
  "tiempoEstimado": "string, formato 'Xh Ymin'",
  "materialEstimadoGramos": number,
  "dificultad": "baja" | "media" | "alta"
}

Datos del proyecto:
Nombre: ${datos.nombre}
Descripción/uso previsto: ${datos.descripcion}
Material: ${datos.material}
Dimensiones (mm): alto ${datos.alto}, ancho ${datos.ancho}, profundo ${datos.profundo}
Relleno indicado por el usuario: ${datos.relleno}%
Altura de capa indicada: ${datos.alturaCapa}mm
Soportes: ${datos.soportes ? "sí" : "no"}`;
}

async function generarFichaIA(datos) {
  const respuesta = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: construirPrompt(datos) }],
    }),
  });

  if (!respuesta.ok) {
    throw new Error(`Error de red (${respuesta.status})`);
  }

  const cuerpo = await respuesta.json();
  let texto = cuerpo?.content?.[0]?.text ?? "";
  texto = texto
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const json = JSON.parse(texto);

  if (
    typeof json.especificacionesSugeridas !== "string" ||
    typeof json.tiempoEstimado !== "string" ||
    typeof json.materialEstimadoGramos !== "number" ||
    !["baja", "media", "alta"].includes(json.dificultad)
  ) {
    throw new Error("Respuesta con formato inesperado");
  }

  return {
    especificacionesSugeridas: json.especificacionesSugeridas,
    tiempoEstimado: json.tiempoEstimado,
    materialEstimadoGramos: json.materialEstimadoGramos,
    dificultad: json.dificultad,
    generadoEn: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Piezas de UI reutilizables                                          */
/* ------------------------------------------------------------------ */

function Separador() {
  return (
    <div className="relative h-px w-full bg-zinc-800">
      <div className="absolute left-0 top-0 h-px w-6 bg-orange-500" />
    </div>
  );
}

function InsigniaPrioridad({ prioridad }) {
  const meta = PRIORIDADES.find((p) => p.id === prioridad) || PRIORIDADES[0];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${meta.clase}`}
    >
      {prioridad === "alta" && <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-500 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-orange-500" />
      </span>}
      {meta.label}
    </span>
  );
}

function InsigniaMaterial({ material }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-zinc-300">
      <Layers size={10} />
      {material}
    </span>
  );
}

function BotonToggle({ activo, onClick, children, colorActivo }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded border px-3 py-2 font-mono text-xs uppercase tracking-wide transition-colors ${
        activo
          ? colorActivo
          : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

function Spinner({ texto }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-xs text-cyan-400">
      <Loader2 size={14} className="animate-spin" />
      {texto}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Ficha IA (tarjeta compartida)                                       */
/* ------------------------------------------------------------------ */

function TarjetaFichaIA({ ficha, cargando, error, onGenerar, deshabilitado }) {
  return (
    <div className="rounded border border-cyan-700/60 bg-cyan-950/10 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wide text-cyan-400">
          <Sparkles size={14} />
          Ficha técnica IA
        </div>
        <button
          type="button"
          onClick={onGenerar}
          disabled={cargando || deshabilitado}
          className="inline-flex items-center gap-1 rounded border border-cyan-600 bg-cyan-900/30 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-cyan-300 transition-colors hover:bg-cyan-900/60 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {ficha ? <RotateCcw size={12} /> : <Sparkles size={12} />}
          {ficha ? "Regenerar" : "Generar ficha técnica"}
        </button>
      </div>

      {cargando && <Spinner texto="Analizando pieza…" />}

      {!cargando && error && (
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-1.5 text-xs text-orange-400">
            <AlertCircle size={13} />
            No se pudo generar la ficha, inténtalo de nuevo.
          </p>
        </div>
      )}

      {!cargando && !error && ficha && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <div className="col-span-2">
            <dt className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">Especificaciones</dt>
            <dd className="mt-0.5 text-zinc-200">{ficha.especificacionesSugeridas}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">Tiempo estimado</dt>
            <dd className="mt-0.5 font-mono text-zinc-200">{ficha.tiempoEstimado}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">Material estimado</dt>
            <dd className="mt-0.5 font-mono text-zinc-200">{ficha.materialEstimadoGramos} g</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">Dificultad</dt>
            <dd className="mt-0.5 font-mono capitalize text-zinc-200">{ficha.dificultad}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">Generado</dt>
            <dd className="mt-0.5 font-mono text-zinc-500">{formatearFecha(ficha.generadoEn)}</dd>
          </div>
        </dl>
      )}

      {!cargando && !error && !ficha && (
        <p className="text-xs text-zinc-500">
          Sin ficha generada todavía. Usa el botón para pedirle a la IA una estimación técnica.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lightbox                                                             */
/* ------------------------------------------------------------------ */

function Lightbox({ src, onClose }) {
  useEffect(() => {
    function alPulsarTecla(evento) {
      if (evento.key === "Escape") onClose();
    }
    window.addEventListener("keydown", alPulsarTecla);
    return () => window.removeEventListener("keydown", alPulsarTecla);
  }, [onClose]);

  if (!src) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-6"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded border border-zinc-700 bg-zinc-900/80 p-2 text-zinc-300 hover:text-white"
        aria-label="Cerrar"
      >
        <X size={18} />
      </button>
      <img
        src={src}
        alt="Vista ampliada"
        className="max-h-full max-w-full rounded border border-zinc-700 object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Galería de resultados                                               */
/* ------------------------------------------------------------------ */

function GaleriaResultados({ proyecto, dispatch, exigirCierre, onCerrado }) {
  const [subiendo, setSubiendo] = useState(false);
  const [errorSubida, setErrorSubida] = useState("");
  const [lightbox, setLightbox] = useState(null);
  const [valoracion, setValoracion] = useState(proyecto.valoracion || null);
  const [notasMejora, setNotasMejora] = useState(proyecto.notasMejora || "");
  const inputFotosRef = useRef(null);

  useEffect(() => {
    setValoracion(proyecto.valoracion || null);
    setNotasMejora(proyecto.notasMejora || "");
  }, [proyecto.id]);

  async function alSubirFotos(evento) {
    const archivos = Array.from(evento.target.files || []);
    if (archivos.length === 0) return;
    setSubiendo(true);
    setErrorSubida("");
    try {
      const comprimidas = await Promise.all(archivos.map((archivo) => comprimirImagen(archivo, 1200, 0.8)));
      dispatch({ type: "AÑADIR_FOTO", id: proyecto.id, campo: "fotosDespues", fotos: comprimidas });
    } catch (error) {
      console.error(error);
      setErrorSubida("No se pudieron procesar una o varias fotos. Inténtalo de nuevo.");
    } finally {
      setSubiendo(false);
      if (inputFotosRef.current) inputFotosRef.current.value = "";
    }
  }

  function guardarValoracion(valor) {
    setValoracion(valor);
    dispatch({ type: "ACTUALIZAR", id: proyecto.id, cambios: { valoracion: valor } });
  }

  function guardarNotas() {
    dispatch({ type: "ACTUALIZAR", id: proyecto.id, cambios: { notasMejora } });
  }

  function cerrarDefinitivamente() {
    dispatch({ type: "ACTUALIZAR", id: proyecto.id, cambios: { valoracion, notasMejora } });
    if (onCerrado) onCerrado();
  }

  const puedeCerrar = Boolean(valoracion);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-zinc-500">Antes</p>
          {proyecto.fotosAntes.length === 0 ? (
            <div className="flex h-24 items-center justify-center rounded border border-dashed border-zinc-800 text-[11px] text-zinc-600">
              Sin fotos de referencia
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {proyecto.fotosAntes.map((foto, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightbox(foto)}
                  className="aspect-square overflow-hidden rounded border border-zinc-800"
                >
                  <img src={foto} alt={`Antes ${i + 1}`} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-zinc-500">Después</p>
          {proyecto.fotosDespues.length === 0 ? (
            <div className="flex h-24 items-center justify-center rounded border border-dashed border-zinc-800 text-[11px] text-zinc-600">
              Sin fotos del resultado
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {proyecto.fotosDespues.map((foto, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightbox(foto)}
                  className="aspect-square overflow-hidden rounded border border-zinc-800"
                >
                  <img src={foto} alt={`Después ${i + 1}`} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs uppercase tracking-wide text-zinc-300 hover:border-cyan-600 hover:text-cyan-300">
          <Camera size={14} />
          Subir fotos del resultado
          <input
            ref={inputFotosRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={alSubirFotos}
          />
        </label>
        {subiendo && (
          <div className="mt-2">
            <Spinner texto="Comprimiendo fotos…" />
          </div>
        )}
        {errorSubida && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-orange-400">
            <AlertCircle size={13} />
            {errorSubida}
          </p>
        )}
      </div>

      <Separador />

      <div>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-zinc-500">
          Valoración del resultado {exigirCierre && <span className="text-orange-500">*</span>}
        </p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => guardarValoracion(n)}
              className="rounded p-1 transition-colors"
              aria-label={`Valorar con ${n} estrellas`}
            >
              <Star
                size={22}
                className={n <= (valoracion || 0) ? "fill-orange-500 text-orange-500" : "text-zinc-700"}
              />
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-2 block font-mono text-[10px] uppercase tracking-wide text-zinc-500">
          Notas de mejora para la próxima iteración
        </label>
        <textarea
          value={notasMejora}
          onChange={(e) => setNotasMejora(e.target.value)}
          onBlur={guardarNotas}
          rows={3}
          placeholder="Ej. aumentar relleno al 30%, ajustar tolerancias en el encaje…"
          className="w-full rounded border border-zinc-700 bg-zinc-900 p-2 text-sm text-zinc-200 outline-none focus:border-cyan-600"
        />
      </div>

      {exigirCierre && (
        <button
          type="button"
          disabled={!puedeCerrar}
          onClick={cerrarDefinitivamente}
          className="flex w-full items-center justify-center gap-2 rounded bg-orange-600 px-4 py-2 font-mono text-xs uppercase tracking-wide text-white transition-colors hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <CheckCircle2 size={14} />
          Cerrar proyecto definitivamente
        </button>
      )}

      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Campo editable inline                                               */
/* ------------------------------------------------------------------ */

function CampoEditable({ valor, onGuardar, tipo = "texto", opciones, sufijo, clase }) {
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(valor);

  useEffect(() => {
    setBorrador(valor);
  }, [valor]);

  function confirmar() {
    setEditando(false);
    if (borrador !== valor && borrador !== "" && borrador !== null) {
      onGuardar(tipo === "numero" ? Number(borrador) : borrador);
    }
  }

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        className={`group inline-flex w-full items-center justify-between gap-2 rounded border border-transparent px-1.5 py-1 text-left hover:border-zinc-700 hover:bg-zinc-900/60 ${clase || ""}`}
      >
        <span>
          {valor}
          {sufijo || ""}
        </span>
        <PencilLine size={12} className="shrink-0 text-zinc-600 opacity-0 group-hover:opacity-100" />
      </button>
    );
  }

  if (tipo === "select") {
    return (
      <select
        autoFocus
        value={borrador}
        onChange={(e) => setBorrador(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => e.key === "Enter" && confirmar()}
        className="w-full rounded border border-cyan-600 bg-zinc-900 px-1.5 py-1 text-zinc-100 outline-none"
      >
        {opciones.map((op) => (
          <option key={op} value={op}>
            {op}
          </option>
        ))}
      </select>
    );
  }

  if (tipo === "textarea") {
    return (
      <textarea
        autoFocus
        rows={3}
        value={borrador}
        onChange={(e) => setBorrador(e.target.value)}
        onBlur={confirmar}
        className="w-full rounded border border-cyan-600 bg-zinc-900 px-1.5 py-1 text-zinc-100 outline-none"
      />
    );
  }

  return (
    <input
      autoFocus
      type={tipo === "numero" ? "number" : "text"}
      value={borrador}
      onChange={(e) => setBorrador(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => e.key === "Enter" && confirmar()}
      className="w-full rounded border border-cyan-600 bg-zinc-900 px-1.5 py-1 text-zinc-100 outline-none"
    />
  );
}

/* ------------------------------------------------------------------ */
/* Panel de detalle                                                    */
/* ------------------------------------------------------------------ */

function PanelDetalle({ proyecto, dispatch, onCerrar, abrirGaleriaAlEntrar }) {
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [cargandoIA, setCargandoIA] = useState(false);
  const [errorIA, setErrorIA] = useState("");

  useEffect(() => {
    function alPulsarTecla(evento) {
      if (evento.key === "Escape") onCerrar();
    }
    window.addEventListener("keydown", alPulsarTecla);
    return () => window.removeEventListener("keydown", alPulsarTecla);
  }, [onCerrar]);

  if (!proyecto) return null;

  function actualizar(cambios) {
    dispatch({ type: "ACTUALIZAR", id: proyecto.id, cambios });
  }

  async function alGenerarFicha() {
    setCargandoIA(true);
    setErrorIA("");
    try {
      const ficha = await generarFichaIA({
        nombre: proyecto.nombre,
        descripcion: proyecto.descripcion,
        material: proyecto.material,
        alto: proyecto.dimensiones.alto,
        ancho: proyecto.dimensiones.ancho,
        profundo: proyecto.dimensiones.profundo,
        relleno: proyecto.notasTecnicas.relleno,
        alturaCapa: proyecto.notasTecnicas.alturaCapa,
        soportes: proyecto.notasTecnicas.soportes,
      });
      dispatch({ type: "SET_FICHA_IA", id: proyecto.id, ficha });
    } catch (error) {
      console.error(error);
      setErrorIA(error.message || "Error desconocido");
    } finally {
      setCargandoIA(false);
    }
  }

  function eliminar() {
    dispatch({ type: "ELIMINAR", id: proyecto.id });
    onCerrar();
  }

  const necesitaGaleria = proyecto.estado === "completado" || proyecto.fotosAntes.length > 0 || proyecto.fotosDespues.length > 0;
  const exigirCierre = abrirGaleriaAlEntrar && proyecto.estado === "completado" && !proyecto.valoracion;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={onCerrar} />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-zinc-500">
            <FileBox size={14} className="text-orange-500" />
            Ficha de proyecto
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 px-4 py-4">
          <div>
            <CampoEditable
              valor={proyecto.nombre}
              onGuardar={(v) => actualizar({ nombre: v })}
              clase="text-lg font-semibold text-zinc-50"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <InsigniaMaterial material={proyecto.material} />
              <InsigniaPrioridad prioridad={proyecto.prioridad} />
              <span className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-zinc-300">
                <span
                  className="h-2.5 w-2.5 rounded-full border border-zinc-600"
                  style={{ backgroundColor: proyecto.color }}
                />
                {proyecto.color}
              </span>
            </div>
          </div>

          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-zinc-500">Descripción / uso previsto</p>
            <CampoEditable
              tipo="textarea"
              valor={proyecto.descripcion}
              onGuardar={(v) => actualizar({ descripcion: v })}
              clase="text-sm text-zinc-300"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-zinc-500">Material</p>
              <CampoEditable
                tipo="select"
                opciones={MATERIALES}
                valor={proyecto.material}
                onGuardar={(v) => actualizar({ material: v })}
                clase="font-mono text-sm text-zinc-200"
              />
            </div>
            <div>
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-zinc-500">Estado</p>
              <select
                value={proyecto.estado}
                onChange={(e) => dispatch({ type: "CAMBIAR_ESTADO", id: proyecto.id, estado: e.target.value })}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 font-mono text-sm text-zinc-200 outline-none focus:border-cyan-600"
              >
                {ESTADOS.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <p className="mb-1 flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-zinc-500">
              <Ruler size={11} /> Dimensiones (mm)
            </p>
            <div className="grid grid-cols-3 gap-2 font-mono text-sm text-zinc-200">
              <CampoEditable
                tipo="numero"
                sufijo=" mm alto"
                valor={proyecto.dimensiones.alto}
                onGuardar={(v) => actualizar({ dimensiones: { ...proyecto.dimensiones, alto: v } })}
              />
              <CampoEditable
                tipo="numero"
                sufijo=" mm ancho"
                valor={proyecto.dimensiones.ancho}
                onGuardar={(v) => actualizar({ dimensiones: { ...proyecto.dimensiones, ancho: v } })}
              />
              <CampoEditable
                tipo="numero"
                sufijo=" mm prof."
                valor={proyecto.dimensiones.profundo}
                onGuardar={(v) => actualizar({ dimensiones: { ...proyecto.dimensiones, profundo: v } })}
              />
            </div>
          </div>

          <div>
            <p className="mb-1 flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-zinc-500">
              <Gauge size={11} /> Notas técnicas
            </p>
            <div className="grid grid-cols-3 gap-2 font-mono text-sm text-zinc-200">
              <CampoEditable
                tipo="numero"
                sufijo="% relleno"
                valor={proyecto.notasTecnicas.relleno}
                onGuardar={(v) => actualizar({ notasTecnicas: { ...proyecto.notasTecnicas, relleno: v } })}
              />
              <CampoEditable
                tipo="numero"
                sufijo=" mm capa"
                valor={proyecto.notasTecnicas.alturaCapa}
                onGuardar={(v) => actualizar({ notasTecnicas: { ...proyecto.notasTecnicas, alturaCapa: v } })}
              />
              <button
                type="button"
                onClick={() =>
                  actualizar({ notasTecnicas: { ...proyecto.notasTecnicas, soportes: !proyecto.notasTecnicas.soportes } })
                }
                className={`rounded border px-2 py-1 text-xs ${
                  proyecto.notasTecnicas.soportes
                    ? "border-cyan-600 bg-cyan-950/40 text-cyan-300"
                    : "border-zinc-700 bg-zinc-900 text-zinc-400"
                }`}
              >
                {proyecto.notasTecnicas.soportes ? "Con soportes" : "Sin soportes"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-zinc-500">Color</p>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={proyecto.color}
                  onChange={(e) => actualizar({ color: e.target.value })}
                  className="h-7 w-8 cursor-pointer rounded border border-zinc-700 bg-zinc-900"
                />
                <div className="flex-1">
                  <CampoEditable
                    valor={proyecto.color}
                    onGuardar={(v) => actualizar({ color: v })}
                    clase="font-mono text-sm text-zinc-200"
                  />
                </div>
              </div>
            </div>
            <div>
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-zinc-500">Prioridad</p>
              <div className="flex gap-1">
                {PRIORIDADES.map((p) => (
                  <BotonToggle
                    key={p.id}
                    activo={proyecto.prioridad === p.id}
                    onClick={() => actualizar({ prioridad: p.id })}
                    colorActivo={p.clase}
                  >
                    {p.label}
                  </BotonToggle>
                ))}
              </div>
            </div>
          </div>

          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-zinc-500">Referencia del modelo</p>
            <div className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 text-sm text-zinc-300">
              {proyecto.referencia.tipo === "link" ? <LinkIcon size={14} className="shrink-0 text-cyan-400" /> : <FileBox size={14} className="shrink-0 text-cyan-400" />}
              <div className="min-w-0 flex-1">
                <CampoEditable
                  valor={proyecto.referencia.valor}
                  onGuardar={(v) =>
                    actualizar({
                      referencia:
                        proyecto.referencia.tipo === "link"
                          ? { ...proyecto.referencia, valor: v }
                          : { ...proyecto.referencia, valor: v, nombreArchivo: v },
                    })
                  }
                  clase="truncate text-sm text-zinc-300"
                />
              </div>
              {proyecto.referencia.tipo === "link" && esUrlValida(proyecto.referencia.valor) && (
                <a
                  href={proyecto.referencia.valor}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-cyan-400 hover:underline"
                  aria-label="Abrir enlace"
                >
                  <ChevronDown size={14} className="-rotate-90" />
                </a>
              )}
            </div>
          </div>

          <Separador />

          <TarjetaFichaIA
            ficha={proyecto.fichaIA}
            cargando={cargandoIA}
            error={errorIA}
            onGenerar={alGenerarFicha}
          />

          <Separador />

          <div>
            <p className="mb-3 font-mono text-[10px] uppercase tracking-wide text-zinc-500">Histórico de estados</p>
            <ol className="space-y-3">
              {proyecto.historico.map((entrada, i) => {
                const meta = ESTADOS.find((e) => e.id === entrada.estado);
                const Icono = meta ? meta.icon : Clock;
                return (
                  <li key={i} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-orange-600 bg-orange-950/40 text-orange-400">
                      <Icono size={12} />
                    </div>
                    <div>
                      <p className="text-sm text-zinc-200">{meta ? meta.label : entrada.estado}</p>
                      <p className="font-mono text-[11px] text-zinc-500">{formatearFecha(entrada.fecha)}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          {necesitaGaleria && (
            <>
              <Separador />
              <div>
                <p className="mb-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-zinc-500">
                  <ImageIcon size={12} /> Resultado y galería
                </p>
                <GaleriaResultados
                  proyecto={proyecto}
                  dispatch={dispatch}
                  exigirCierre={exigirCierre}
                  onCerrado={onCerrar}
                />
              </div>
            </>
          )}

          <Separador />

          <div>
            {!confirmarEliminar ? (
              <button
                type="button"
                onClick={() => setConfirmarEliminar(true)}
                className="flex w-full items-center justify-center gap-2 rounded border border-zinc-800 px-4 py-2 font-mono text-xs uppercase tracking-wide text-zinc-400 hover:border-orange-700 hover:text-orange-400"
              >
                <Trash2 size={14} />
                Eliminar proyecto
              </button>
            ) : (
              <div className="flex items-center gap-2 rounded border border-orange-700 bg-orange-950/20 p-2">
                <p className="flex-1 text-xs text-orange-300">¿Eliminar definitivamente?</p>
                <button
                  type="button"
                  onClick={() => setConfirmarEliminar(false)}
                  className="rounded border border-zinc-700 px-2 py-1 font-mono text-[10px] uppercase text-zinc-300"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={eliminar}
                  className="rounded bg-orange-600 px-2 py-1 font-mono text-[10px] uppercase text-white hover:bg-orange-500"
                >
                  Confirmar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tarjeta y tablero Kanban                                            */
/* ------------------------------------------------------------------ */

function TarjetaProyecto({ proyecto, onAbrir, onDragStart }) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, proyecto.id)}
      onClick={() => onAbrir(proyecto.id)}
      className="group cursor-grab space-y-2 rounded border border-zinc-800 bg-zinc-900 p-3 shadow-sm transition-colors hover:border-cyan-700 active:cursor-grabbing"
      style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%, 8px 100%, 0 calc(100% - 8px))" }}
    >
      {proyecto.fotosAntes[0] && (
        <div className="-mx-3 -mt-3 mb-2 h-24 overflow-hidden border-b border-zinc-800">
          <img src={proyecto.fotosAntes[0]} alt="" className="h-full w-full object-cover opacity-80" />
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium text-zinc-100">{proyecto.nombre}</h4>
        {proyecto.fichaIA && <Sparkles size={13} className="mt-0.5 shrink-0 text-cyan-400" />}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <InsigniaMaterial material={proyecto.material} />
        <InsigniaPrioridad prioridad={proyecto.prioridad} />
        <span
          className="h-3.5 w-3.5 rounded-full border border-zinc-600"
          style={{ backgroundColor: proyecto.color }}
          title={proyecto.color}
        />
      </div>
      <div className="flex items-center justify-between font-mono text-[10px] text-zinc-500">
        <span className="inline-flex items-center gap-1">
          <Clock size={10} />
          {new Date(proyecto.creadoEn).toLocaleDateString("es-ES")}
        </span>
        {proyecto.prioridad === "alta" && <AlertTriangle size={12} className="text-orange-500" />}
      </div>
    </div>
  );
}

function ColumnaKanban({ estado, proyectos, onAbrir, onDragStart, onDragOver, onDrop, arrastrandoSobre }) {
  const Icono = estado.icon;
  return (
    <div
      onDragOver={(e) => onDragOver(e, estado.id)}
      onDrop={(e) => onDrop(e, estado.id)}
      className={`flex w-72 shrink-0 snap-start flex-col rounded border bg-zinc-950 transition-colors md:w-auto ${
        arrastrandoSobre ? "border-cyan-600 bg-cyan-950/10" : "border-zinc-800"
      }`}
    >
      <div
        className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-3 py-2.5"
        style={{ clipPath: "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)" }}
      >
        <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wide text-zinc-300">
          <Icono size={14} className="text-orange-500" />
          {estado.label}
        </div>
        <span className="rounded-full border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
          {proyectos.length}
        </span>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ minHeight: "120px" }}>
        {proyectos.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded border border-dashed border-zinc-800 text-center text-[11px] text-zinc-600">
            Sin proyectos aquí
          </div>
        ) : (
          proyectos.map((p) => (
            <TarjetaProyecto key={p.id} proyecto={p} onAbrir={onAbrir} onDragStart={onDragStart} />
          ))
        )}
      </div>
    </div>
  );
}

function TableroKanban({ proyectos, onAbrir, dispatch, onCompletado }) {
  const [idArrastrado, setIdArrastrado] = useState(null);
  const [columnaSobre, setColumnaSobre] = useState(null);

  function alIniciarArrastre(e, id) {
    setIdArrastrado(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  }

  function alPasarPorEncima(e, estadoId) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (columnaSobre !== estadoId) setColumnaSobre(estadoId);
  }

  function alSoltar(e, estadoId) {
    e.preventDefault();
    const id = idArrastrado || e.dataTransfer.getData("text/plain");
    setColumnaSobre(null);
    setIdArrastrado(null);
    if (!id) return;
    const proyecto = proyectos.find((p) => p.id === id);
    if (!proyecto || proyecto.estado === estadoId) return;
    dispatch({ type: "CAMBIAR_ESTADO", id, estado: estadoId });
    if (estadoId === "completado") onCompletado(id);
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 pt-1 snap-x snap-mandatory md:grid md:grid-cols-5 md:overflow-visible">
      {ESTADOS.map((estado) => (
        <ColumnaKanban
          key={estado.id}
          estado={estado}
          proyectos={proyectos.filter((p) => p.estado === estado.id)}
          onAbrir={onAbrir}
          onDragStart={alIniciarArrastre}
          onDragOver={alPasarPorEncima}
          onDrop={alSoltar}
          arrastrandoSobre={columnaSobre === estado.id}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Barra de filtros                                                    */
/* ------------------------------------------------------------------ */

const FILTROS_INICIALES = {
  texto: "",
  estados: [],
  materiales: [],
  prioridades: [],
  desde: "",
  hasta: "",
};

function hayFiltrosActivos(filtros) {
  return (
    filtros.texto !== "" ||
    filtros.estados.length > 0 ||
    filtros.materiales.length > 0 ||
    filtros.prioridades.length > 0 ||
    filtros.desde !== "" ||
    filtros.hasta !== ""
  );
}

function Chip({ activo, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors ${
        activo
          ? "border-cyan-600 bg-cyan-950/50 text-cyan-300"
          : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600"
      }`}
    >
      {children}
    </button>
  );
}

function BarraFiltros({ filtros, setFiltros, totalProyectos, totalFiltrados }) {
  const [mostrarMas, setMostrarMas] = useState(false);

  function alternarEnLista(campo, valor) {
    setFiltros((prev) => {
      const lista = prev[campo];
      const nueva = lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
      return { ...prev, [campo]: nueva };
    });
  }

  return (
    <div className="space-y-3 border-b border-zinc-800 bg-zinc-950/95 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={filtros.texto}
            onChange={(e) => setFiltros((prev) => ({ ...prev, texto: e.target.value }))}
            placeholder="Buscar por nombre o descripción…"
            className="w-full rounded border border-zinc-700 bg-zinc-900 py-1.5 pl-8 pr-2 text-sm text-zinc-200 outline-none focus:border-cyan-600"
          />
        </div>

        <button
          type="button"
          onClick={() => setMostrarMas((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wide text-zinc-300 hover:border-zinc-600"
        >
          <SlidersHorizontal size={13} />
          Filtros
          <ChevronDown size={13} className={`transition-transform ${mostrarMas ? "rotate-180" : ""}`} />
        </button>

        {hayFiltrosActivos(filtros) && (
          <button
            type="button"
            onClick={() => setFiltros(FILTROS_INICIALES)}
            className="inline-flex items-center gap-1 rounded border border-orange-800 bg-orange-950/20 px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wide text-orange-400 hover:bg-orange-950/40"
          >
            <X size={12} />
            Limpiar filtros
          </button>
        )}

        <span className="ml-auto font-mono text-[11px] text-zinc-500">
          Mostrando {totalFiltrados} de {totalProyectos} proyectos
        </span>
      </div>

      {mostrarMas && (
        <div className="space-y-3 rounded border border-zinc-800 bg-zinc-900/40 p-3">
          <div>
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-zinc-500">Estado</p>
            <div className="flex flex-wrap gap-1.5">
              {ESTADOS.map((e) => (
                <Chip key={e.id} activo={filtros.estados.includes(e.id)} onClick={() => alternarEnLista("estados", e.id)}>
                  {e.label}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-zinc-500">Material</p>
            <div className="flex flex-wrap gap-1.5">
              {MATERIALES.map((m) => (
                <Chip key={m} activo={filtros.materiales.includes(m)} onClick={() => alternarEnLista("materiales", m)}>
                  {m}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-zinc-500">Prioridad</p>
            <div className="flex flex-wrap gap-1.5">
              {PRIORIDADES.map((p) => (
                <Chip key={p.id} activo={filtros.prioridades.includes(p.id)} onClick={() => alternarEnLista("prioridades", p.id)}>
                  {p.label}
                </Chip>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-zinc-500">Desde</p>
              <input
                type="date"
                value={filtros.desde}
                onChange={(e) => setFiltros((prev) => ({ ...prev, desde: e.target.value }))}
                className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-200 outline-none focus:border-cyan-600"
              />
            </div>
            <div>
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-zinc-500">Hasta</p>
              <input
                type="date"
                value={filtros.hasta}
                onChange={(e) => setFiltros((prev) => ({ ...prev, hasta: e.target.value }))}
                className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-200 outline-none focus:border-cyan-600"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Formulario de nuevo proyecto                                        */
/* ------------------------------------------------------------------ */

const FORM_INICIAL = {
  nombre: "",
  descripcion: "",
  material: "PLA",
  color: "#f97316",
  alto: "",
  ancho: "",
  profundo: "",
  prioridad: "media",
  tabReferencia: "link",
  referenciaLink: "",
  referenciaArchivoNombre: "",
  referenciaArchivoMiniatura: null,
  relleno: 20,
  alturaCapa: 0.2,
  soportes: false,
};

function FormularioProyecto({ onCrear, onCerrar }) {
  const [form, setForm] = useState(FORM_INICIAL);
  const [ficha, setFicha] = useState(null);
  const [cargandoIA, setCargandoIA] = useState(false);
  const [errorIA, setErrorIA] = useState("");
  const [procesandoArchivo, setProcesandoArchivo] = useState(false);

  function actualizar(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  async function alSeleccionarArchivo(evento) {
    const archivo = evento.target.files?.[0];
    if (!archivo) return;
    setProcesandoArchivo(true);
    try {
      if (esImagen(archivo)) {
        const miniatura = await comprimirImagen(archivo, 800, 0.75);
        setForm((prev) => ({ ...prev, referenciaArchivoNombre: archivo.name, referenciaArchivoMiniatura: miniatura }));
      } else {
        setForm((prev) => ({ ...prev, referenciaArchivoNombre: archivo.name, referenciaArchivoMiniatura: null }));
      }
    } catch (error) {
      console.error(error);
      setForm((prev) => ({ ...prev, referenciaArchivoNombre: archivo.name, referenciaArchivoMiniatura: null }));
    } finally {
      setProcesandoArchivo(false);
    }
  }

  const errores = useMemo(() => {
    const e = {};
    if (form.nombre.trim().length < 3) e.nombre = "Mínimo 3 caracteres";
    if (form.descripcion.trim().length === 0) e.descripcion = "Obligatorio";
    if (!(Number(form.alto) > 0)) e.alto = "Debe ser > 0";
    if (!(Number(form.ancho) > 0)) e.ancho = "Debe ser > 0";
    if (!(Number(form.profundo) > 0)) e.profundo = "Debe ser > 0";
    if (form.tabReferencia === "link" && !esUrlValida(form.referenciaLink)) e.referencia = "URL no válida";
    if (form.tabReferencia === "archivo" && !form.referenciaArchivoNombre) e.referencia = "Selecciona un archivo";
    return e;
  }, [form]);

  const esValido = Object.keys(errores).length === 0;
  const puedeGenerarIA = form.nombre.trim().length >= 3 && form.descripcion.trim().length > 0;

  async function alGenerarFicha() {
    setCargandoIA(true);
    setErrorIA("");
    try {
      const resultado = await generarFichaIA({
        nombre: form.nombre,
        descripcion: form.descripcion,
        material: form.material,
        alto: form.alto,
        ancho: form.ancho,
        profundo: form.profundo,
        relleno: form.relleno,
        alturaCapa: form.alturaCapa,
        soportes: form.soportes,
      });
      setFicha(resultado);
    } catch (error) {
      console.error(error);
      setErrorIA(error.message || "Error desconocido");
    } finally {
      setCargandoIA(false);
    }
  }

  function alEnviar(evento) {
    evento.preventDefault();
    if (!esValido) return;

    const ahora = new Date().toISOString();
    const referencia =
      form.tabReferencia === "link"
        ? { tipo: "link", valor: form.referenciaLink }
        : { tipo: "archivo", valor: form.referenciaArchivoNombre, nombreArchivo: form.referenciaArchivoNombre };

    const proyecto = {
      id: uid(),
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim(),
      material: form.material,
      color: form.color,
      dimensiones: { alto: Number(form.alto), ancho: Number(form.ancho), profundo: Number(form.profundo) },
      prioridad: form.prioridad,
      referencia,
      notasTecnicas: {
        relleno: Number(form.relleno),
        alturaCapa: Number(form.alturaCapa),
        soportes: form.soportes,
      },
      fichaIA: ficha,
      estado: "pendiente",
      historico: [{ estado: "pendiente", fecha: ahora }],
      fotosAntes: form.referenciaArchivoMiniatura ? [form.referenciaArchivoMiniatura] : [],
      fotosDespues: [],
      valoracion: null,
      notasMejora: "",
      creadoEn: ahora,
    };

    onCrear(proyecto);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded border border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-4 py-3">
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wide text-zinc-200">
            <Plus size={14} className="text-orange-500" />
            Nuevo proyecto
          </div>
          <button type="button" onClick={onCerrar} className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <form id="formulario-nuevo-proyecto" onSubmit={alEnviar} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-zinc-500">Nombre del proyecto *</label>
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => actualizar("nombre", e.target.value)}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-cyan-600"
              placeholder="Soporte para auriculares"
            />
            {form.nombre && errores.nombre && <p className="mt-1 text-[11px] text-orange-400">{errores.nombre}</p>}
          </div>

          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-zinc-500">Descripción / uso previsto *</label>
            <textarea
              rows={3}
              value={form.descripcion}
              onChange={(e) => actualizar("descripcion", e.target.value)}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-cyan-600"
              placeholder="Para sujetar los auriculares junto al monitor…"
            />
            {form.descripcion && errores.descripcion && <p className="mt-1 text-[11px] text-orange-400">{errores.descripcion}</p>}
          </div>

          {puedeGenerarIA && (
            <TarjetaFichaIA ficha={ficha} cargando={cargandoIA} error={errorIA} onGenerar={alGenerarFicha} />
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-zinc-500">Material</label>
              <select
                value={form.material}
                onChange={(e) => actualizar("material", e.target.value)}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-sm text-zinc-100 outline-none focus:border-cyan-600"
              >
                {MATERIALES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-zinc-500">Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => actualizar("color", e.target.value)}
                  className="h-8 w-9 cursor-pointer rounded border border-zinc-700 bg-zinc-900"
                />
                <input
                  type="text"
                  value={form.color}
                  onChange={(e) => actualizar("color", e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-sm text-zinc-100 outline-none focus:border-cyan-600"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-zinc-500">
              <Ruler size={11} /> Dimensiones (mm) *
            </label>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                min="0"
                placeholder="Alto"
                value={form.alto}
                onChange={(e) => actualizar("alto", e.target.value)}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-sm text-zinc-100 outline-none focus:border-cyan-600"
              />
              <input
                type="number"
                min="0"
                placeholder="Ancho"
                value={form.ancho}
                onChange={(e) => actualizar("ancho", e.target.value)}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-sm text-zinc-100 outline-none focus:border-cyan-600"
              />
              <input
                type="number"
                min="0"
                placeholder="Profundo"
                value={form.profundo}
                onChange={(e) => actualizar("profundo", e.target.value)}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-sm text-zinc-100 outline-none focus:border-cyan-600"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-zinc-500">Prioridad</label>
            <div className="flex gap-2">
              {PRIORIDADES.map((p) => (
                <BotonToggle
                  key={p.id}
                  activo={form.prioridad === p.id}
                  onClick={() => actualizar("prioridad", p.id)}
                  colorActivo={p.clase}
                >
                  {p.label}
                </BotonToggle>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-zinc-500">Referencia de modelo 3D *</label>
            <div className="mb-2 flex gap-2">
              <button
                type="button"
                onClick={() => actualizar("tabReferencia", "link")}
                className={`flex-1 rounded border px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wide ${
                  form.tabReferencia === "link" ? "border-cyan-600 bg-cyan-950/40 text-cyan-300" : "border-zinc-700 text-zinc-400"
                }`}
              >
                <LinkIcon size={12} className="mr-1 inline" /> Link
              </button>
              <button
                type="button"
                onClick={() => actualizar("tabReferencia", "archivo")}
                className={`flex-1 rounded border px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wide ${
                  form.tabReferencia === "archivo" ? "border-cyan-600 bg-cyan-950/40 text-cyan-300" : "border-zinc-700 text-zinc-400"
                }`}
              >
                <Upload size={12} className="mr-1 inline" /> Archivo
              </button>
            </div>

            {form.tabReferencia === "link" ? (
              <input
                type="text"
                placeholder="https://www.thingiverse.com/thing/…"
                value={form.referenciaLink}
                onChange={(e) => actualizar("referenciaLink", e.target.value)}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-cyan-600"
              />
            ) : (
              <div>
                <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded border border-dashed border-zinc-700 bg-zinc-900 px-3 py-3 font-mono text-xs uppercase tracking-wide text-zinc-400 hover:border-cyan-600 hover:text-cyan-300">
                  <Upload size={14} />
                  {form.referenciaArchivoNombre || "Seleccionar archivo .stl, .obj o imagen"}
                  <input type="file" accept=".stl,.obj,image/*" className="hidden" onChange={alSeleccionarArchivo} />
                </label>
                {procesandoArchivo && (
                  <div className="mt-1.5">
                    <Spinner texto="Procesando archivo…" />
                  </div>
                )}
              </div>
            )}
            {errores.referencia && <p className="mt-1 text-[11px] text-orange-400">{errores.referencia}</p>}
          </div>

          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-zinc-500">
              Relleno: {form.relleno}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={form.relleno}
              onChange={(e) => actualizar("relleno", Number(e.target.value))}
              className="w-full accent-orange-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-zinc-500">Altura de capa (mm)</label>
              <input
                type="number"
                step="0.04"
                min="0.04"
                value={form.alturaCapa}
                onChange={(e) => actualizar("alturaCapa", e.target.value)}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-sm text-zinc-100 outline-none focus:border-cyan-600"
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-zinc-500">Soportes</label>
              <button
                type="button"
                onClick={() => actualizar("soportes", !form.soportes)}
                className={`w-full rounded border px-2.5 py-1.5 font-mono text-xs uppercase tracking-wide ${
                  form.soportes ? "border-cyan-600 bg-cyan-950/40 text-cyan-300" : "border-zinc-700 bg-zinc-900 text-zinc-400"
                }`}
              >
                {form.soportes ? "Sí" : "No"}
              </button>
            </div>
          </div>
        </form>

        <div className="border-t border-zinc-800 bg-zinc-900/60 px-4 py-3">
          <button
            type="submit"
            form="formulario-nuevo-proyecto"
            disabled={!esValido}
            className="flex w-full items-center justify-center gap-2 rounded bg-orange-600 px-4 py-2 font-mono text-xs uppercase tracking-wide text-white transition-colors hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={14} />
            Crear proyecto
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* App raíz                                                             */
/* ------------------------------------------------------------------ */

export default function App() {
  const [proyectos, dispatch] = useReducer(proyectosReducer, [], cargarProyectosDesdeStorage);
  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [idDetalle, setIdDetalle] = useState(null);
  const [enfocarGaleria, setEnfocarGaleria] = useState(false);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);

  useEffect(() => {
    guardarProyectosEnStorage(proyectos);
  }, [proyectos]);

  const proyectosFiltrados = useMemo(() => {
    const texto = filtros.texto.trim().toLowerCase();
    return proyectos.filter((p) => {
      if (texto) {
        const coincide =
          p.nombre.toLowerCase().includes(texto) || p.descripcion.toLowerCase().includes(texto);
        if (!coincide) return false;
      }
      if (filtros.estados.length > 0 && !filtros.estados.includes(p.estado)) return false;
      if (filtros.materiales.length > 0 && !filtros.materiales.includes(p.material)) return false;
      if (filtros.prioridades.length > 0 && !filtros.prioridades.includes(p.prioridad)) return false;
      if (filtros.desde) {
        const fechaDesde = new Date(filtros.desde);
        if (new Date(p.creadoEn) < fechaDesde) return false;
      }
      if (filtros.hasta) {
        const fechaHasta = new Date(filtros.hasta);
        fechaHasta.setHours(23, 59, 59, 999);
        if (new Date(p.creadoEn) > fechaHasta) return false;
      }
      return true;
    });
  }, [proyectos, filtros]);

  const proyectoDetalle = useMemo(() => proyectos.find((p) => p.id === idDetalle) || null, [proyectos, idDetalle]);

  function alCrearProyecto(proyecto) {
    dispatch({ type: "CREAR", payload: proyecto });
    setFormularioAbierto(false);
  }

  function abrirDetalle(id) {
    setEnfocarGaleria(false);
    setIdDetalle(id);
  }

  function alCompletarDesdeKanban(id) {
    setEnfocarGaleria(true);
    setIdDetalle(id);
  }

  function cerrarDetalle() {
    setIdDetalle(null);
    setEnfocarGaleria(false);
  }

  return (
    <div className="min-h-screen bg-zinc-950 font-sans text-zinc-200">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded border border-orange-600 bg-orange-950/30 text-orange-500">
            <Printer size={16} />
          </div>
          <div>
            <h1 className="font-mono text-sm font-semibold uppercase tracking-wide text-zinc-100">Taller 3D</h1>
            <p className="font-mono text-[10px] text-zinc-500">Gestión de proyectos de impresión</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setFormularioAbierto(true)}
          className="inline-flex items-center gap-1.5 rounded bg-orange-600 px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-white hover:bg-orange-500"
        >
          <Plus size={14} />
          Nuevo proyecto
        </button>
      </header>

      <BarraFiltros
        filtros={filtros}
        setFiltros={setFiltros}
        totalProyectos={proyectos.length}
        totalFiltrados={proyectosFiltrados.length}
      />

      <main className="px-4 py-4">
        {proyectos.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded border border-dashed border-zinc-800 py-20 text-center">
            <Wrench size={28} className="text-zinc-700" />
            <p className="text-sm text-zinc-500">Todavía no hay proyectos en el taller.</p>
            <button
              type="button"
              onClick={() => setFormularioAbierto(true)}
              className="mt-2 inline-flex items-center gap-1.5 rounded border border-orange-600 bg-orange-950/20 px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-orange-400 hover:bg-orange-950/40"
            >
              <Plus size={14} />
              Crear el primero
            </button>
          </div>
        ) : (
          <TableroKanban
            proyectos={proyectosFiltrados}
            onAbrir={abrirDetalle}
            dispatch={dispatch}
            onCompletado={alCompletarDesdeKanban}
          />
        )}
      </main>

      {formularioAbierto && (
        <FormularioProyecto onCrear={alCrearProyecto} onCerrar={() => setFormularioAbierto(false)} />
      )}

      {proyectoDetalle && (
        <PanelDetalle
          proyecto={proyectoDetalle}
          dispatch={dispatch}
          onCerrar={cerrarDetalle}
          abrirGaleriaAlEntrar={enfocarGaleria}
        />
      )}
    </div>
  );
}
