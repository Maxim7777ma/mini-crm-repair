import os
import asyncio
from passlib.hash import bcrypt
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select
from app.models import User, UserRole, Base

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set")

engine = create_async_engine(DATABASE_URL, future=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

async def upsert_user(email: str, password: str, role: UserRole):
    async with SessionLocal() as session:
        res = await session.execute(select(User).where(User.email == email))
        user = res.scalar_one_or_none()
        if user:
            print(f"[seed] user exists: {email}")
            return
        user = User(email=email, password_hash=bcrypt.hash(password), role=role, is_active=True)
        session.add(user)
        await session.commit()
        print(f"[seed] created: {email} ({role})")

async def main():
    # если миграции уже применены — create_all ничего не поломает
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await upsert_user("admin@example.com", "admin123", UserRole.admin)
    await upsert_user("worker@example.com", "worker123", UserRole.worker)

if __name__ == "__main__":
    asyncio.run(main())
