"""Peticiones HTTP con reintentos ante fallos de red transitorios (cortes de wifi/datos móviles)."""
import time

import httpx

MAX_ATTEMPTS = 4
BACKOFF_SECONDS = 3
RETRYABLE_STATUS = {502, 503, 504}


def request_with_retry(method: str, url: str, **kwargs) -> httpx.Response:
    """Como httpx.request + raise_for_status(), pero reintentando ante errores de red
    transitorios (timeout, conexión cortada, 502/503/504) con backoff. Un 4xx o un 500 del
    servidor no se reintenta: solo tiene sentido reintentar lo que puede arreglarse solo."""
    last_error: Exception | None = None
    for attempt in range(MAX_ATTEMPTS):
        try:
            response = httpx.request(method, url, **kwargs)
            response.raise_for_status()
            return response
        except httpx.HTTPStatusError as error:
            # 502/503/504 = pasarela o servidor saturado momentáneamente (el WFS del IGN lo da a
            # veces en mitad de una descarga paginada): eso sí puede arreglarse solo.
            if error.response.status_code not in RETRYABLE_STATUS:
                raise
            last_error = error
        except (httpx.TransportError, httpx.TimeoutException) as error:
            last_error = error
        if attempt < MAX_ATTEMPTS - 1:
            time.sleep(BACKOFF_SECONDS * (attempt + 1))
    raise last_error
