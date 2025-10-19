# app/db.py
from typing import AsyncGenerator  # или: from collections.abc import AsyncIterator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from app.core.config import settings

engine = create_async_engine(settings.DATABASE_URL, future=True, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

# Вариант 1:
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as s:
        yield s
