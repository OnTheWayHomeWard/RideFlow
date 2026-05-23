from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://rideflow:rideflow@db:5432/rideflow"
    DATABASE_URL_SYNC: str = "postgresql://rideflow:rideflow@db:5432/rideflow"
    JWT_SECRET: str = "change-me"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_HOURS: int = 24
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_PHONE_NUMBER: str = ""
    # Preferred for US A2P 10DLC — send via the campaign-linked Messaging Service.
    # When set, takes priority over TWILIO_PHONE_NUMBER.
    TWILIO_MESSAGING_SERVICE_SID: str = ""
    GOOGLE_MAPS_API_KEY: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
