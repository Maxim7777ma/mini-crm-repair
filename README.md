# Mini-CRM “Repair Requests”

Мини-CRM на **FastAPI + PostgreSQL** для приёма и обработки заявок на ремонт:
- Клиент отправляет публичную заявку.
- Создаётся тикет в статусе `new`.
- Админ распределяет тикеты на работников.
- Работник видит только свои тикеты и меняет статусы: `new → in_progress → done`.

Поддержано:
- Пагинация на всех списках,
- Авторизация **JWT** (admin / worker),
- Управление пользователями админом (CRUD),
- Публичный эндпоинт для создания тикета,
- Поиск по заголовку, фильтрация по статусу,
- Разграничение прав (admin full, worker — только свои тикеты),
- Валидация и корректные HTTP коды,
- Docker / Compose, миграции Alembic,
- CI/CD → Docker Hub (GitHub Actions).

---

## Стек

- Python **3.13**
- FastAPI, Pydantic v2
- SQLAlchemy 2.0 (async) + asyncpg
- PostgreSQL 16
- Alembic (миграции)
- JWT (простая авторизация)
- Docker / docker-compose
- GitHub Actions → Docker Hub

---

🧭 Демонстрация

Если развернуто демо:

🌐 UI: https://mini-crm.b2y.com.ua/ui

📘 Swagger: https://mini-crm.b2y.com.ua/docs

🧰 Docker Hub: https://hub.docker.com/r/maxim7777ma/mini-crm-repair

## Структура (минимально)

> Фактические файлы могут отличаться; важны точки входа и конфиги.

```

mini-crm-repair/
├─ app/
│  ├─ main.py                # FastAPI приложение (app.main:app)
│  ├─ db.py                  # подключение к БД, Base metadata
│  ├─ models.py              # User, Client, Ticket
│  ├─ schemas.py             # Pydantic-модели
│  ├─ deps.py                # Depends (auth, role)
│  ├─ routes/
│  │  ├─ auth.py             # /auth/*
│  │  ├─ users.py            # /users (admin)
│  │  ├─ clients.py          # /clients (admin)
│  │  └─ tickets.py          # /tickets, /tickets/public
│  └─ utils/                 # jwt, security, pagination helpers
├─ alembic/                  # миграции (после alembic init)
│  ├─ versions/*.py
│  └─ env.py                 # async конфигурация
├─ templates/                # (если есть UI /ui/*)
├─ static/                   # (если есть js/css)
├─ Dockerfile
├─ docker-compose.yml
├─ requirements.txt
├─ README.md                 # этот файл
└─ .env                      # локальные переменные окружения (см. .env.example)

````

---

## Быстрый старт (локально)

### 1) Зависимости
- Docker + Docker Compose

### 2) Клонируйте репозиторий
```bash
git clone <your-repo-url> mini-crm-repair
cd mini-crm-repair
````

### 3) Создайте `.env`

> Скопируйте из примера ниже и при необходимости поменяйте значения.

```env
# .env (локально)
DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/repair_db
JWT_SECRET=change_me_in_prod
JWT_EXPIRES=3600
ENV=local
```

### 4) Запуск

```bash
docker compose up --build
```

* API поднимется на `http://localhost:8000`
* Документация Swagger: `http://localhost:8000/docs`
* В dev-compose включён `--reload` + `WATCHFILES_FORCE_POLLING=true` (удобно на macOS/Windows).

### 5) Миграции Alembic

```bash
# применить все миграции
docker compose exec api alembic upgrade head
```

### 6) Создайте тестовые аккаунты

```bash
# Админ:
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123","password_confirm":"admin123","role":"admin"}'

# Воркер:
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"worker@example.com","password":"worker123","password_confirm":"worker123","role":"worker"}'
```

Далее логин:

```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}'
```

В ответе будет `access_token` — используйте в `Authorization: Bearer <token>`.

---

## Docker / Compose

### Dockerfile (уже есть)

```dockerfile
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

# инструменты сборки для greenlet и прочих бинарных зависимостей
RUN apt-get update && apt-get install -y --no-install-recommends build-essential gcc g++ \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### docker-compose.yml (уже есть)

```yaml
services:
  api:
    build: .
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    volumes:
      - .:/app          # hot reload
    env_file: .env
    depends_on:
      - db
    ports:
      - "8000:8000"
    environment:
      WATCHFILES_FORCE_POLLING: "true"

  db:
    image: postgres:16
    environment:
      POSTGRES_DB: repair_db
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

---

## Переменные окружения

| Переменная     | Назначение                        | Пример                                                     |
| -------------- | --------------------------------- | ---------------------------------------------------------- |
| `DATABASE_URL` | Строка подключения к БД (asyncpg) | `postgresql+asyncpg://postgres:postgres@db:5432/repair_db` |
| `JWT_SECRET`   | Секрет для подписи JWT            | `change_me_in_prod`                                        |
| `JWT_EXPIRES`  | Время жизни токена (сек)          | `3600`                                                     |
| `ENV`          | Окружение                         | `local`                                                    |

---

## Миграции (Alembic)

**Базовые команды:**

```bash
# применить новые миграции
docker compose exec api alembic upgrade head

# создать новую ревизию
docker compose exec api alembic revision -m "add something"

# откатить на одну
docker compose exec api alembic downgrade -1
```

**Храните даты как `timestamptz` (UTC):**

* В моделях: `sa.DateTime(timezone=True)`
* Если колонки были `timestamp without time zone` и содержат UTC-данные — разовая конвертация:

```sql
ALTER TABLE tickets ALTER COLUMN created_at
  TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
ALTER TABLE tickets ALTER COLUMN updated_at
  TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE tickets ALTER COLUMN scheduled_at
  TYPE timestamptz USING scheduled_at AT TIME ZONE 'UTC';
ALTER TABLE users ALTER COLUMN created_at
  TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
```

---

## Роли и права

* **admin** — полный доступ: CRUD воркеров/клиентов/тикетов, назначение исполнителей.
* **worker** — доступ **только к своим** тикетам, может менять статусы своих тикетов.
* **public** — может создавать тикет через `/tickets/public` без авторизации.

---

## Сущности (минимальный набор полей)

> Имена/типы могут отличаться в коде — это ориентир.

### User

* `id: int`
* `email: str` (уникальный)
* `password_hash: str`
* `role: Literal["admin","worker"]`
* `created_at: timestamptz`

### Client

* `id: int`
* `name: str | None`
* `phone: str | None`
* `email: str | None`
* `comment: str | None`
* `created_at: timestamptz`

### Ticket

* `id: int`
* `title: str`
* `description: str | None`
* `status: Literal["new","in_progress","done","canceled"]`
* `client_id: int` (FK → Client)
* `assignee_id: int | None` (FK → User.worker)
* `scheduled_at: timestamptz | None`
* `created_at: timestamptz`
* `updated_at: timestamptz`

---

## Эндпоинты (ядро)

### Auth

* `POST /auth/login` → получает `access_token`
* `GET  /auth/me`    → текущий пользователь
* `POST /auth/register` *(в dev; в проде обычно закрывают)*

**Пример логина:**

```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}'
```

---

### Users (Admin)

* `GET    /users?page=&page_size=&q=&role=` — листинг с пагинацией/поиском/фильтрами
* `POST   /users` — создать (email, role, password)
* `PATCH  /users/{id}` — обновить (роль/пароль/…)
* `DELETE /users/{id}` — удалить

**Создать воркера:**

```bash
TOKEN=<ADMIN_JWT>
curl -X POST http://localhost:8000/users \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"email":"work2@example.com","role":"worker","password":"worker123"}'
```

---

### Clients (Admin)

* `GET /clients?page=&page_size=&q=`

---

### Tickets

* `POST /tickets/public` — публичная заявка (без токена)
* `GET  /tickets?q=&status=&page=&page_size=` — список:

  * **Admin** видит всё,
  * **Worker** видит **только свои** (где он `assignee_id`)
* `PATCH /tickets/{id}` — обновить статус, assignee (по ролям)

**Пример публичной заявки:**

```bash
curl -X POST http://localhost:8000/tickets/public \
  -H "Content-Type: application/json" \
  -d '{
        "title": "Не включается стиралка",
        "description": "После щелчка выбивает автомат",
        "scheduled_at": "2025-01-14T10:00:00Z",
        "client": {
          "name": "Иван",
          "phone": "+380671112233",
          "email": "ivan@example.com",
          "comment": "Позвонить заранее"
        }
      }'
```

**Фильтр/пагинация:**

```bash
TOKEN=<JWT>
curl "http://localhost:8000/tickets?q=стиралка&status=new&status=done&page=1&page_size=20" \
  -H "Authorization: Bearer $TOKEN"
```

**Обновить тикет:**

```bash
TOKEN=<ADMIN_OR_ASSIGNED_WORKER_JWT>
curl -X PATCH http://localhost:8000/tickets/123 \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"in_progress","assignee_id":2}'
```

---

## UI (опционально)

Если подключены HTML-шаблоны:

* `/ui` — главная с публичной формой.
* `/ui/login` — вход.
* `/ui/tickets` — список тикетов (по ролям).
* `/ui/users` — управление пользователями (admin).

---

## Прод: Docker Hub + Compose

### 1) Собрать и запушить образ

```bash
docker build -t <dockerhub-username>/mini-crm:latest .
docker push <dockerhub-username>/mini-crm:latest
```

### 2) `docker-compose.prod.yml`

Создайте файл (на сервере/в репозитории):

```yaml
services:
  api:
    image: <dockerhub-username>/mini-crm:latest
    env_file: .env
    depends_on:
      - db
    ports:
      - "8000:8000"
    command: >
      sh -c "alembic upgrade head &&
             uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers"

  db:
    image: postgres:16
    environment:
      POSTGRES_DB: repair_db
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

### 3) Запуск на сервере

```bash
docker compose -f docker-compose.prod.yml up -d
```

---

## CI/CD: GitHub Actions → Docker Hub

1. В репозитории GitHub создайте секреты:

   * `DOCKERHUB_USERNAME`
   * `DOCKERHUB_TOKEN` (Docker Hub Access Token)

2. Добавьте Workflow: `.github/workflows/docker-publish.yml`

```yaml
name: Docker Publish

on:
  push:
    branches: [ "main" ]
    tags: [ "v*.*.*" ]

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Extract tags/labels
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ secrets.DOCKERHUB_USERNAME }}/mini-crm
          tags: |
            type=raw,value=latest,enable={{is_default_branch}}
            type=sha
            type=ref,event=tag

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
```

3. Теперь **push в `main`** или **создание тега `vX.Y.Z`** — запустит сборку и пуш образа в Docker Hub.

---

## .dockerignore (рекомендуется)

Создайте файл `.dockerignore` в корне:


__pycache__/
*.pyc
*.pyo
*.pyd
*.sqlite3
.env
.env.*
.venv/
venv/
.git/
.gitignore
.idea/
.vscode/
dist/
build/
node_modules/


---

## Тонкости времени (UTC)

* В бекенде всегда храните **UTC** (`timestamptz`, `timezone=True`).
* На фронте показывайте через `toLocaleString()` — пользователь увидит локальное время.
* Если раньше писались «наивные» `timestamp without time zone` — конвертируйте SQL-ом (см. выше).

---

## Траблшут

* **401 Unauthorized** — истёк/невалиден JWT → перелогин.
* **DB connection** — проверьте `DATABASE_URL` и что контейнер `db` запущен.
* **Миграции** — `alembic upgrade head`. Если сломались версии → восстановите/пересоздайте.
* **Hot reload не реагирует** — уже включён `WATCHFILES_FORCE_POLLING=true` в Compose для macOS/Windows.




---

## Лицензия

MIT — делайте форки, меняйте под себя.

---



# trigger воскресенье, 19 октября 2025 г. 13:30:10 (EEST)
