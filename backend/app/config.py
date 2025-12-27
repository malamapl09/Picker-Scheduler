from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Application
    app_name: str = "Picker Scheduling System"
    debug: bool = False

    # Database
    database_url: str = "postgresql://postgres:postgres@localhost:5432/picker_scheduler"

    # JWT Authentication
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24  # 24 hours

    # Labor Standards Defaults
    default_orders_per_picker_hour: float = 10.0
    default_min_shift_hours: int = 4
    default_max_shift_hours: int = 8

    # Compliance Rules
    max_hours_per_week: int = 44
    max_hours_per_day: int = 8
    days_on_per_week: int = 6
    break_minutes_8hr_shift: int = 30
    break_minutes_9hr_shift: int = 60

    # Store Hours
    store_open_hour: int = 8   # 8 AM
    store_close_hour: int = 22  # 10 PM

    class Config:
        env_file = ".env"
        extra = "allow"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
