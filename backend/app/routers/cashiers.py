from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.cashier import Cashier
from app.models.hotel import Hotel
from app.schemas.cashier import CashierValidateOut

router = APIRouter(prefix="/api", tags=["cashiers"])


@router.get("/cashiers/{ref_code}/validate", response_model=CashierValidateOut)
async def validate_cashier(ref_code: str, db: AsyncSession = Depends(get_db)):
    """
    Validate a cashier ref code (from QR scan).
    Returns cashier + hotel info so the frontend can pre-fill pickup.
    """
    result = await db.execute(
        select(Cashier).where(
            Cashier.ref_code == ref_code,
            Cashier.status == "active",
        )
    )
    cashier = result.scalar_one_or_none()
    if not cashier:
        raise HTTPException(status_code=404, detail="Invalid or inactive cashier code")

    # Get hotel info
    hotel_name = None
    hotel_address = None
    if cashier.hotel_id:
        hotel_result = await db.execute(
            select(Hotel).where(Hotel.id == cashier.hotel_id)
        )
        hotel = hotel_result.scalar_one_or_none()
        if hotel:
            hotel_name = hotel.name
            hotel_address = hotel.address

    return CashierValidateOut(
        cashier_id=cashier.id,
        cashier_name=cashier.name,
        ref_code=cashier.ref_code,
        hotel_id=cashier.hotel_id,
        hotel_name=hotel_name,
        hotel_address=hotel_address,
        hotel_lat=float(hotel.lat) if hotel and hotel.lat else None,
        hotel_lng=float(hotel.lng) if hotel and hotel.lng else None,
    )
