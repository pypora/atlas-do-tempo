"""HTTP boundary for the Atlas application."""

import hmac
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from pydantic import ValidationError

from atlas.config import Settings
from atlas.database import Database
from atlas.repository import EventRepository, InvalidReference
from atlas.schemas import EVENT_ID, EventInput, ImportPayload

MAX_REQUEST_BYTES = 12_000_000
STATIC_FILES = {
    "/": "index.html",
    "/index.html": "index.html",
    "/app.js": "app.js",
    "/styles.css": "styles.css",
    "/favicon.svg": "favicon.svg",
    "/favicon.ico": "favicon.ico",
    "/assets/aura/aura.js": "assets/aura/aura.js",
    "/assets/aura/aura.css": "assets/aura/aura.css",
    "/assets/aura/fontes-aura/manrope-variable.ttf": "assets/aura/fontes-aura/manrope-variable.ttf",
    "/assets/aura/fontes-aura/manrope-OFL.txt": "assets/aura/fontes-aura/manrope-OFL.txt",
}


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    database = Database(settings)
    repository = EventRepository(database)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        database.open()
        try:
            yield
        finally:
            database.close()

    app = FastAPI(
        title="Atlas do Tempo",
        version="1.0.0",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )

    @app.middleware("http")
    async def protect(request: Request, call_next):
        headers = {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "Cache-Control": "no-store",
            "Content-Security-Policy": (
                "default-src 'self'; img-src 'self' data:; font-src 'self'; "
                "style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; "
                "base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
            ),
        }
        if request.url.path != "/health" and not settings.development:
            supplied = request.headers.get("X-Homelab-Gateway", "")
            if not hmac.compare_digest(supplied, settings.gateway_token or ""):
                return JSONResponse(
                    {"error": "Acesso privado necessário."}, status_code=403, headers=headers
                )
        if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            if not settings.development and request.headers.get("Origin") != settings.public_origin:
                return JSONResponse({"error": "Origem inválida."}, status_code=403, headers=headers)
            if request.method != "DELETE":
                if request.headers.get("content-type", "").split(";", 1)[0] != "application/json":
                    return JSONResponse({"error": "Envie JSON."}, status_code=415, headers=headers)
                try:
                    size = int(request.headers.get("content-length", "-1"))
                except ValueError:
                    size = -1
                if size < 0 or size > MAX_REQUEST_BYTES:
                    return JSONResponse(
                        {"error": "Envie JSON de até 12 MB."}, status_code=413, headers=headers
                    )
        response = await call_next(request)
        response.headers.update(headers)
        return response

    @app.exception_handler(RequestValidationError)
    async def request_error(_request: Request, _error: RequestValidationError):
        return JSONResponse(
            {"error": "Dados inválidos. Revise os campos enviados."}, status_code=400
        )

    @app.exception_handler(ValidationError)
    async def validation_error(_request: Request, _error: ValidationError):
        return JSONResponse({"error": "Registro inválido no arquivo."}, status_code=400)

    @app.exception_handler(InvalidReference)
    async def invalid_reference(_request: Request, error: InvalidReference):
        return JSONResponse({"error": str(error)}, status_code=400)

    @app.exception_handler(ValueError)
    async def invalid_value(_request: Request, error: ValueError):
        return JSONResponse({"error": str(error)}, status_code=400)

    @app.exception_handler(HTTPException)
    async def http_error(_request: Request, error: HTTPException):
        return JSONResponse({"error": error.detail}, status_code=error.status_code)

    @app.get("/health")
    def health():
        with database.pool.connection() as connection:
            connection.execute("SELECT 1")
        return {"ok": True}

    @app.get("/api/events")
    def list_events():
        return {"events": repository.list()}

    @app.get("/api/search")
    def search(q: str = ""):
        return {"events": repository.list(q) if q.strip() else []}

    @app.get("/api/export")
    def export():
        return {"format": "atlas-do-tempo-v1", "events": repository.list()}

    @app.post("/api/import")
    def import_events(payload: ImportPayload):
        imported, skipped = repository.import_events(payload)
        return {"imported": imported, "skipped": skipped}

    @app.post("/api/events", status_code=201)
    def create_event(item: EventInput):
        return {"event": repository.create(item)}

    @app.put("/api/events/{event_id}")
    def update_event(event_id: str, item: EventInput):
        if not EVENT_ID.fullmatch(event_id):
            raise HTTPException(404, detail="Acontecimento não encontrado.")
        event = repository.update(event_id, item)
        if event is None:
            raise HTTPException(404, detail="Acontecimento não encontrado.")
        return {"event": event}

    @app.delete("/api/events/{event_id}")
    def delete_event(event_id: str):
        if not EVENT_ID.fullmatch(event_id) or not repository.delete(event_id):
            return JSONResponse({"deleted": False}, status_code=404)
        return {"deleted": True}

    @app.get("/{path:path}", include_in_schema=False)
    def static(path: str):
        relative = STATIC_FILES.get("/" + path)
        if relative is None:
            raise HTTPException(404, detail="Não encontrado.")
        file = Path(settings.public_dir) / relative
        return FileResponse(file)

    return app
