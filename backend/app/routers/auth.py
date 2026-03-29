from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.admin import Admin
from app.models.driver import Driver
from app.models.cashier import Cashier
from app.schemas.auth import LoginRequest, TokenResponse
from app.utils.security import verify_password, create_access_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/admin/login", response_model=TokenResponse)
async def admin_login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    if not req.email:
        raise HTTPException(status_code=400, detail="Email required for admin login")

    result = await db.execute(
        select(Admin).where(Admin.email == req.email, Admin.is_active == True)
    )
    admin = result.scalar_one_or_none()

    if not admin or not verify_password(req.password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({"sub": str(admin.id), "role": "admin"})
    return TokenResponse(access_token=token, role="admin", name=admin.name)


@router.post("/driver/login", response_model=TokenResponse)
async def driver_login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    if not req.phone:
        raise HTTPException(status_code=400, detail="Phone required for driver login")

    result = await db.execute(
        select(Driver).where(Driver.phone == req.phone, Driver.status == "active")
    )
    driver = result.scalar_one_or_none()

    if not driver or not verify_password(req.password, driver.password_hash):
        raise HTTPException(status_code=401, detail="Invalid phone or password")

    token = create_access_token({"sub": str(driver.id), "role": "driver"})
    return TokenResponse(access_token=token, role="driver", name=driver.name, password_changed=driver.password_changed)


@router.post("/cashier/login", response_model=TokenResponse)
async def cashier_login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    if not req.phone:
        raise HTTPException(status_code=400, detail="Phone required for cashier login")

    result = await db.execute(
        select(Cashier).where(Cashier.phone == req.phone, Cashier.status == "active")
    )
    cashier = result.scalar_one_or_none()

    if not cashier or not cashier.password_hash or not verify_password(req.password, cashier.password_hash):
        raise HTTPException(status_code=401, detail="Invalid phone or password")

    token = create_access_token({"sub": str(cashier.id), "role": "cashier"})
    return TokenResponse(access_token=token, role="cashier", name=cashier.name, password_changed=cashier.password_changed)
