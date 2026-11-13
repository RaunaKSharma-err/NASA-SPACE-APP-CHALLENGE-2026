from fastapi import APIRouter

from app.api.v1 import datasets, extras, health, providers, routes

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router, tags=["health"])
api_router.include_router(datasets.router, tags=["data"])
api_router.include_router(routes.router, tags=["routing"])
api_router.include_router(providers.router, tags=["providers"])
api_router.include_router(extras.router, tags=["assistant", "offline", "sync"])
