from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db import get_session
from app.models import User, UserRole
from app.security import decode_token
from app.core.config import settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

async def get_db(session: AsyncSession = Depends(get_session)):
    return session

async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)) -> User:
    try:
        email = decode_token(token).get("sub")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def admin_required(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin only")
    return user

def worker_or_admin(user: User = Depends(get_current_user)) -> User:
    return user

def paginate_params(page: int = 1, page_size: int = settings.PAGE_SIZE_DEFAULT):
    page = max(page, 1)
    page_size = max(1, min(page_size, settings.PAGE_SIZE_MAX))
    return page, page_size
