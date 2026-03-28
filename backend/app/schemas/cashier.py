from uuid import UUID
from pydantic import BaseModel


class CashierValidateOut(BaseModel):
    cashier_id: UUID
    cashier_name: str
    ref_code: str
    hotel_id: UUID | None = None
    hotel_name: str | None = None
    hotel_address: str | None = None
    hotel_lat: float | None = None
    hotel_lng: float | None = None

    model_config = {"from_attributes": True}
