from uuid import UUID
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.admin import Admin
from app.models.driver import Driver
from app.models.cashier import Cashier

security = HTTPBearer()


async def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> Admin:
    try:
        payload = jwt.decode(credentials.credentials, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id = payload.get("sub")
        role = payload.get("role")
        if not user_id or role != "admin":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    result = await db.execute(select(Admin).where(Admin.id == UUID(user_id)))
    admin = result.scalar_one_or_none()
    if not admin or not admin.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin not found or inactive")
    return admin


async def get_current_driver(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> Driver:
    try:
        payload = jwt.decode(credentials.credentials, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id = payload.get("sub")
        role = payload.get("role")
        if not user_id or role != "driver":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    result = await db.execute(select(Driver).where(Driver.id == UUID(user_id)))
    driver = result.scalar_one_or_none()
    if not driver or driver.status != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Driver not found or inactive")
    return driver


async def get_current_cashier(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> Cashier:
    try:
        payload = jwt.decode(credentials.credentials, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id = payload.get("sub")
        role = payload.get("role")
        if not user_id or role != "cashier":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    result = await db.execute(select(Cashier).where(Cashier.id == UUID(user_id)))
    cashier = result.scalar_one_or_none()
    if not cashier or cashier.status != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Cashier not found or inactive")
    return cashier


# ─── Unified ───
# Resolves the JWT to whichever staff role it represents (admin / driver /
# cashier) and returns a small dict — used by endpoints that should work for
# any logged-in staff user, e.g. /api/notifications/*.

async def get_any_authenticated_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return {role, id, name, raw} for any valid admin/driver/cashier JWT."""
    try:
        payload = jwt.decode(credentials.credentials, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id = payload.get("sub")
        role = payload.get("role")
        if not user_id or role not in ("admin", "driver", "cashier"):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    uid = UUID(user_id)
    if role == "admin":
        r = await db.execute(select(Admin).where(Admin.id == uid))
        u = r.scalar_one_or_none()
        if not u or not u.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin not found or inactive")
        return {"role": "admin", "id": u.id, "name": u.name, "raw": u}
    if role == "driver":
        r = await db.execute(select(Driver).where(Driver.id == uid))
        u = r.scalar_one_or_none()
        if not u or u.status != "active":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Driver not found or inactive")
        return {"role": "driver", "id": u.id, "name": u.name, "raw": u}
    # cashier
    r = await db.execute(select(Cashier).where(Cashier.id == uid))
    u = r.scalar_one_or_none()
    if not u or u.status != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Cashier not found or inactive")
    return {"role": "cashier", "id": u.id, "name": u.name, "raw": u}
