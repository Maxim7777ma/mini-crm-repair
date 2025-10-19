from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, cast, String

from app.db import get_session
from app.models import Client, User, UserRole
from app.deps import admin_required, worker_or_admin, paginate_params
from app.schemas import ClientOut, Page

router = APIRouter(prefix="/clients", tags=["clients"])

@router.get("", response_model=Page)
async def list_clients(
    q: str | None = Query(None),
    user: User = Depends(worker_or_admin),  # видеть могут и админ, и воркер
    db: AsyncSession = Depends(get_session),
    page_params: tuple[int, int] = Depends(paginate_params),
):
    page, page_size = page_params

    stmt = select(Client)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(
                Client.name.ilike(like),
                Client.phone.ilike(like),
                Client.email.ilike(like),
                cast(Client.id, String).ilike(like),
            )
        )

    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar()
    rows = (await db.execute(stmt.offset((page - 1) * page_size).limit(page_size))).scalars().all()
    items = [ClientOut.model_validate(c, from_attributes=True) for c in rows]
    return {"items": items, "page": page, "page_size": page_size, "total": total}
