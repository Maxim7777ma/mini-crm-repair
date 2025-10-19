
from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas import UserCreate, UserOut, Page
from app.models import User, UserRole
from app.db import get_session
from app.deps import admin_required, paginate_params
from app.security import hash_password
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, delete, func, or_, cast, String
from app.schemas import UserUpdate  

router = APIRouter(prefix="/users", tags=["users"])

@router.post("", response_model=UserOut)
async def create_user(body: UserCreate, _: User = Depends(admin_required), db: AsyncSession = Depends(get_session)):
    exists = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail="Email already exists")
    user = User(email=body.email, role=UserRole(body.role), password_hash=hash_password(body.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user

@router.get("", response_model=Page)
async def list_users(
    q: str | None = Query(None),
    role: list[UserRole] | None = Query(None),
    _: User = Depends(admin_required),
    db: AsyncSession = Depends(get_session),
    page_params: tuple[int,int] = Depends(paginate_params),
):
    page, page_size = page_params
    base = select(User)

    if q:
        like = f"%{q}%"
        base = base.where(or_(
            User.email.ilike(like),
            cast(User.id, String).ilike(like),
            cast(User.role, String).ilike(like),
        ))
    if role:
        base = base.where(User.role.in_(role))

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar()
    rows = (await db.execute(base.offset((page-1)*page_size).limit(page_size))).scalars().all()
    items = [UserOut.model_validate(u, from_attributes=True) for u in rows]
    return {"items": items, "page": page, "page_size": page_size, "total": total}


@router.delete("/{user_id}", status_code=204)
async def delete_user(user_id: int, _: User = Depends(admin_required), db: AsyncSession = Depends(get_session)):
    await db.execute(delete(User).where(User.id == user_id))
    await db.commit()



@router.put("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    body: UserUpdate,
    current: User = Depends(admin_required),
    db: AsyncSession = Depends(get_session),
):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # ⛔️ Нельзя менять другого администратора
    if user.role == UserRole.admin and user.id != current.id:
        raise HTTPException(status_code=403, detail="Нельзя изменять другого администратора")
    
    if body.email:
        user.email = body.email
    if body.password:
        user.password_hash = hash_password(body.password)
    if body.role:
        user.role = UserRole(body.role)

    await db.commit()
    await db.refresh(user)
    return user