from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import api_router
from app.core.config import get_settings
from app.core.errors import register_error_handlers

# Register format adapters so they are available to the provider system.
import app.services.formats  # noqa: F401


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version="0.1.0")
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                       allow_methods=["*"], allow_headers=["*"])
    register_error_handlers(app)
    app.include_router(api_router)
    return app


app = create_app()
