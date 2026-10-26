"""Peticiones HTTP con reintentos ante fallos de red transitorios (cortes de wifi/datos móviles)."""
import time

import httpx

MAX_ATTEMPTS = 4
BACKOFF_SECONDS = 3


def request_with_retry(method: str, url: str, **kwargs) -> httpx.Response:
    """Como httpx.request + raise_for_status(), pero reintentando ante errores de red
    transitorios (timeout, conexión cortada) con backoff. Un 4xx/5xx real del servidor
    no se reintenta: solo tiene sentido reintentar lo que puede arreglarse solo."""
    last_error: Exception | None = None
    for attempt in range(MAX_ATTEMPTS):
        try:
            response = httpx.request(method, url, **kwargs)
            response.raise_for_status()
            return response
        except (httpx.TransportError, httpx.TimeoutException) as error:
            last_error = error
            if attempt < MAX_ATTEMPTS - 1:
                time.sleep(BACKOFF_SECONDS * (attempt + 1))
    raise last_error
