from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_serializer, field_validator
from typing import Literal
from enum import Enum

# ====== AUTH ======
class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class UserCreate(BaseModel):
    email: EmailStr
    role: Literal["admin", "worker"]
    password: str = Field(min_length=8)

class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    password_confirm: str = Field(min_length=8)
    role: Literal["admin", "worker"]

    @field_validator("password_confirm")
    def _match(cls, v, info):
        if v != info.data.get("password"):
            raise ValueError("Пароли не совпадают")
        return v

class UserOut(BaseModel):
    id: int
    email: EmailStr
    role: Literal["admin","worker"]
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

    # 👇 ключевая строка — превращаем Enum -> str до валидации
    @field_validator("role", mode="before")
    def _role_to_literal(cls, v):
        if isinstance(v, Enum):
            return v.value
        return v




class UserUpdate(BaseModel):
    email: EmailStr | None = None
    password: str | None = None
    role: str | None = None

# ====== CLIENT ======
class ClientIn(BaseModel):
    name: str
    phone: str | None = None
    email: EmailStr | None = None
    comment: str | None = None

class ClientOut(ClientIn):
    id: int

# ====== TICKETS ======
class TicketBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None

class TicketCreatePublic(TicketBase):
    client: ClientIn
    scheduled_at: datetime | None = None

class TicketCreateAdmin(TicketBase):
    client_id: int
    assignee_id: int | None = None
    status: Literal["new", "in_progress", "done", "canceled"] | None = None
    scheduled_at: datetime | None = None

class TicketUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: Literal["new", "in_progress", "done", "canceled"] | None = None
    assignee_id: int | None = None
    scheduled_at: datetime | None = None

class TicketOut(BaseModel):
    id: int
    title: str
    description: str | None = None
    status: str
    client_id: int
    assignee_id: int | None = None
    scheduled_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

    @field_serializer("status")
    def _serialize_status(self, v):
        return v.value if isinstance(v, Enum) else v

class Page(BaseModel):
    items: list
    page: int
    page_size: int
    total: int
