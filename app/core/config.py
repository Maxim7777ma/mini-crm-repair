from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    APP_NAME: str = "Mini-CRM Repair"
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@db:5432/repair_db"
    JWT_SECRET: str = "change_me"
    JWT_ALG: str = "HS256"
    JWT_EXPIRES: int = 3600
    PAGE_SIZE_DEFAULT: int = 20
    PAGE_SIZE_MAX: int = 100
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
