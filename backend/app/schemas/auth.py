from pydantic import BaseModel


class LoginRequest(BaseModel):
    email: str | None = None
    phone: str | None = None
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    name: str
    password_changed: bool = True
