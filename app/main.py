from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.core.config import settings
from app.routers import auth, users, tickets, clients

app = FastAPI(title=settings.APP_NAME, debug=True)

# API-роуты
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(tickets.router)
app.include_router(clients.router)

# Статика и шаблоны
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")
templates.env.auto_reload = True  # автообновление шаблонов при редактировании

# UI-страницы (без схемы в Swagger)
@app.get("/", include_in_schema=False)
async def root_redirect():
    return RedirectResponse(url="/ui")

@app.get("/ui", include_in_schema=False)
async def ui_home(request: Request):
    return templates.TemplateResponse("home.html", {"request": request})

@app.get("/ui/login", include_in_schema=False)
async def ui_login(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})
@app.get("/ui/register")
async def ui_register(request: Request):
    return templates.TemplateResponse("register.html", {"request": request})

@app.get("/ui/tickets", include_in_schema=False)
async def ui_tickets(request: Request):
    return templates.TemplateResponse("tickets.html", {"request": request})

@app.get("/ui/users", include_in_schema=False)
async def ui_users(request: Request):
    return templates.TemplateResponse("users.html", {"request": request})

@app.get("/health")
async def health():
    return {"status": "ok"}
