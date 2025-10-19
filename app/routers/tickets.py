from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.schemas import TicketCreatePublic, TicketCreateAdmin, TicketUpdate, TicketOut, Page
from app.models import Ticket, Client, User, TicketStatus, UserRole
from app.db import get_session
from app.deps import worker_or_admin, admin_required, paginate_params

router = APIRouter(prefix="/tickets", tags=["tickets"])

@router.post("/public", response_model=TicketOut, status_code=201)
async def public_create(body: TicketCreatePublic, db: AsyncSession = Depends(get_session)):
    client = Client(**body.client.model_dump())
    db.add(client)
    await db.flush()
    t = Ticket(
        title=body.title,
        description=body.description,
        client_id=client.id,
        status=TicketStatus.new,
        scheduled_at=body.scheduled_at,
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return TicketOut.model_validate(t, from_attributes=True)

@router.get("", response_model=Page)
async def list_tickets(
    q: str | None = Query(None),
    status: list[TicketStatus] | None = Query(None),
    user: User = Depends(worker_or_admin),
    db: AsyncSession = Depends(get_session),
    page_params: tuple[int, int] = Depends(paginate_params),
):
    page, page_size = page_params
    stmt = select(Ticket)
    if q:
        stmt = stmt.where(Ticket.title.ilike(f"%{q}%"))
    if status:
        stmt = stmt.where(Ticket.status.in_(status))
    if user.role == UserRole.worker:
        stmt = stmt.where(Ticket.assignee_id == user.id)

    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar()
    rows = (await db.execute(stmt.offset((page - 1) * page_size).limit(page_size))).scalars().all()
    items = [TicketOut.model_validate(r, from_attributes=True) for r in rows]
    return {"items": items, "page": page, "page_size": page_size, "total": total}

@router.get("/{ticket_id}", response_model=TicketOut)
async def get_ticket(ticket_id: int, user: User = Depends(worker_or_admin), db: AsyncSession = Depends(get_session)):
    t = (await db.execute(select(Ticket).where(Ticket.id == ticket_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    if user.role == UserRole.worker and t.assignee_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return TicketOut.model_validate(t, from_attributes=True)

@router.post("", response_model=TicketOut, status_code=201)
async def create_ticket_admin(body: TicketCreateAdmin, _: User = Depends(admin_required), db: AsyncSession = Depends(get_session)):
    t = Ticket(
        title=body.title,
        description=body.description,
        client_id=body.client_id,
        assignee_id=body.assignee_id or None,
        status=TicketStatus(body.status) if body.status else TicketStatus.new,
        scheduled_at=body.scheduled_at,
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return TicketOut.model_validate(t, from_attributes=True)

@router.patch("/{ticket_id}", response_model=TicketOut)
async def update_ticket(ticket_id: int, body: TicketUpdate, user: User = Depends(worker_or_admin), db: AsyncSession = Depends(get_session)):
    t = (await db.execute(select(Ticket).where(Ticket.id == ticket_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Not found")

    data = body.model_dump(exclude_none=True)
    if user.role == UserRole.worker:
        if t.assignee_id != user.id:
            raise HTTPException(status_code=403, detail="Forbidden")
        data.pop("assignee_id", None)
        data.pop("title", None)

    if "status" in data:
        data["status"] = TicketStatus(data["status"])

    for k, v in data.items():
        setattr(t, k, v)

    await db.commit()
    await db.refresh(t)
    return TicketOut.model_validate(t, from_attributes=True)
