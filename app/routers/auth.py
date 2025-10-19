from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from passlib.hash import bcrypt

from app.db import get_session
from app.models import User, UserRole
from app.schemas import RegisterIn, UserOut, LoginIn, TokenOut
from app.security import verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/login", response_model=TokenOut)
async def login(data: LoginIn, db: AsyncSession = Depends(get_session)):
    user = (await db.execute(select(User).where(User.email == data.email))).scalar_one_or_none()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return TokenOut(access_token=create_access_token(user.email))

@router.post("/register", response_model=UserOut, status_code=201)
async def register(data: RegisterIn, db: AsyncSession = Depends(get_session)):
    exists = (await db.execute(select(User).where(User.email == data.email))).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=400, detail="Email уже занят")
    user = User(email=data.email, password_hash=bcrypt.hash(data.password), role=UserRole(data.role))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user, from_attributes=True)

from app.deps import get_current_user

@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return UserOut.model_validate(user, from_attributes=True)
