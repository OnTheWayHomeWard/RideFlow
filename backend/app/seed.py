"""
Seed script — run with: python -m app.seed
Creates default admin, vehicle rates, extras, settings, sample routes, and geofence.
"""
import asyncio
from sqlalchemy import select
from app.database import engine, async_session, Base
from app.models import Admin, VehicleRate, Extra, Setting, CommonRoute, Geofence
from app.utils.security import hash_password


async def seed():
    # Create all tables (fallback if Alembic hasn't run)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as db:
        # Check if already seeded
        result = await db.execute(select(Admin).limit(1))
        if result.scalar_one_or_none():
            print("Database already seeded. Skipping.")
            return

        # --- Admin ---
        admin = Admin(
            name="Admin",
            email="admin@rideflow.com",
            password_hash=hash_password("changeme"),
            role="super_admin",
        )
        db.add(admin)
        print("Created admin: admin@rideflow.com / changeme")

        # --- Vehicle Rates ---
        vehicle_rates = [
            VehicleRate(vehicle_type="sedan", display_name="Sedan", base_fare=15.00, per_mile_rate=2.50, max_passengers=3, max_luggage=2, icon="sedan", sort_order=0),
            VehicleRate(vehicle_type="suv", display_name="SUV", base_fare=20.00, per_mile_rate=3.00, max_passengers=5, max_luggage=3, icon="suv", sort_order=1),
            VehicleRate(vehicle_type="van", display_name="Van", base_fare=25.00, per_mile_rate=3.50, max_passengers=8, max_luggage=5, icon="van", sort_order=2),
            VehicleRate(vehicle_type="large_van", display_name="Large Van", base_fare=35.00, per_mile_rate=4.00, max_passengers=14, max_luggage=8, icon="large_van", sort_order=3),
        ]
        db.add_all(vehicle_rates)
        print("Created 4 vehicle rates")

        # --- Extras ---
        extras = [
            Extra(name="Room Pickup", slug="room_pickup", price=5.00, description="Driver picks you up from your room or lobby"),
            Extra(name="Extra Luggage (3+)", slug="extra_luggage", price=10.00, description="More than 2 bags"),
            Extra(name="Child Seat", slug="child_seat", price=5.00, description="Child safety seat if available"),
        ]
        db.add_all(extras)
        print("Created 3 extras")

        # --- Settings ---
        settings = [
            Setting(key="default_driver_pay_pct", value=70, description="Default driver pay percentage"),
            Setting(key="default_cashier_commission_pct", value=10, description="Default cashier commission percentage"),
            Setting(key="cashier_commission_enabled", value=True, description="Enable cashier commissions globally"),
            Setting(key="booking_window_days", value=30, description="How many days ahead clients can book"),
            Setting(key="cancellation_window_hours", value=2, description="Hours before ride for full refund"),
            Setting(key="late_cancel_refund_pct", value=50, description="Refund % for late cancellations"),
            Setting(key="company_phone", value="5550000000", description="Company contact phone"),
            Setting(key="company_name", value="RideFlow", description="Company display name"),
            Setting(key="sms_enabled", value=True, description="Enable SMS notifications"),
            Setting(key="unassigned_alert_minutes", value=15, description="Alert admin if run unassigned after X minutes"),
            Setting(key="driver_payout_schedule", value="weekly", description="How often drivers are paid"),
        ]
        db.add_all(settings)
        print("Created 11 settings")

        # --- Sample Common Routes ---
        common_routes = [
            CommonRoute(
                name="Airport to Downtown",
                from_name="Airport",
                from_address="Denver International Airport, 8500 Pena Blvd, Denver, CO",
                from_lat=39.8561,
                from_lng=-104.6737,
                to_name="Downtown",
                to_address="Denver City Center, Denver, CO",
                to_lat=39.7392,
                to_lng=-104.9903,
                distance_miles=24.0,
                prices={"sedan": 35, "suv": 45, "van": 55, "large_van": 75},
                sort_order=0,
            ),
            CommonRoute(
                name="Hotel District to Airport",
                from_name="Hotel District",
                from_address="Hotel District, Denver, CO",
                from_lat=39.7430,
                from_lng=-104.9870,
                to_name="Airport",
                to_address="Denver International Airport, 8500 Pena Blvd, Denver, CO",
                to_lat=39.8561,
                to_lng=-104.6737,
                distance_miles=22.0,
                prices={"sedan": 45, "suv": 55, "van": 65, "large_van": 85},
                sort_order=1,
            ),
            CommonRoute(
                name="Airport to Beach Resort",
                from_name="Airport",
                from_address="Denver International Airport, 8500 Pena Blvd, Denver, CO",
                from_lat=39.8561,
                from_lng=-104.6737,
                to_name="Beach Resort",
                to_address="Beach Resort Area, Denver, CO",
                to_lat=39.7000,
                to_lng=-105.0100,
                distance_miles=30.0,
                prices={"sedan": 50, "suv": 60, "van": 75, "large_van": 95},
                sort_order=2,
            ),
        ]
        db.add_all(common_routes)
        print("Created 3 common routes")

        # --- Geofence (sample — large area around Denver) ---
        geofence = Geofence(
            name="Denver Metro Area",
            polygon=[
                {"lat": 39.95, "lng": -105.20},
                {"lat": 39.95, "lng": -104.60},
                {"lat": 39.60, "lng": -104.60},
                {"lat": 39.60, "lng": -105.20},
            ],
        )
        db.add(geofence)
        print("Created geofence: Denver Metro Area")

        await db.commit()
        print("\nSeed complete!")


if __name__ == "__main__":
    asyncio.run(seed())
