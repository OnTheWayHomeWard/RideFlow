"""
Dev seed script — populates the database with realistic sample data for testing.
Run with: python -m app.seed_dev

Creates:
- 4 Hotels
- 6 Cashiers (2 per hotel, all active with QR codes)
- 5 Drivers (various vehicle types, all active + online)
- 8 Sample bookings (various statuses)
- Payment records + splits for paid bookings
- 1 Active upsale
"""
import asyncio
import uuid
from datetime import datetime, date, time, timedelta, timezone

from sqlalchemy import select
from app.database import engine, async_session, Base
from app.models import (
    Admin, Hotel, Cashier, Driver, VehicleRate, Extra, Setting,
    CommonRoute, Geofence, Upsale, Booking, Payment, PaymentSplit,
)
from app.utils.security import hash_password
from app.utils.helpers import generate_booking_number, generate_ref_code


async def seed_dev():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as db:
        # Check if dev data already exists
        result = await db.execute(select(Hotel).limit(1))
        if result.scalar_one_or_none():
            print("Dev data already seeded. Skipping.")
            return

        # ── HOTELS ──
        hotels = [
            Hotel(name="Marriott Downtown", address="1701 California St, Denver, CO 80202", lat=39.7456, lng=-104.9890, contact_name="Sarah Manager", contact_phone="+15559001001", default_commission_pct=10),
            Hotel(name="Hilton Garden Inn", address="1400 Welton St, Denver, CO 80202", lat=39.7440, lng=-104.9870, contact_name="Mike Front Desk", contact_phone="+15559001002", default_commission_pct=12),
            Hotel(name="Hyatt Regency", address="650 15th St, Denver, CO 80202", lat=39.7435, lng=-104.9950, contact_name="Lisa Director", contact_phone="+15559001003", default_commission_pct=10),
            Hotel(name="The Crawford Hotel", address="1701 Wynkoop St, Denver, CO 80202", lat=39.7530, lng=-104.9995, contact_name="James Owner", contact_phone="+15559001004", default_commission_pct=15),
        ]
        db.add_all(hotels)
        await db.flush()
        print(f"Created {len(hotels)} hotels")

        # ── CASHIERS ──
        cashiers_data = [
            ("Sarah Mitchell", "+15558001001", hotels[0].id, "MARR01SA"),
            ("David Chen", "+15558001002", hotels[0].id, "MARR02DA"),
            ("Emily Rodriguez", "+15558001003", hotels[1].id, "HILT01EM"),
            ("James Wilson", "+15558001004", hotels[1].id, "HILT02JA"),
            ("Ana Garcia", "+15558001005", hotels[2].id, "HYAT01AN"),
            ("Tom Brown", "+15558001006", hotels[3].id, "CRAW01TO"),
        ]
        cashiers = []
        for name, phone, hotel_id, ref_code in cashiers_data:
            c = Cashier(
                name=name, phone=phone, hotel_id=hotel_id, ref_code=ref_code,
                email=f"{name.split()[0].lower()}@test.com",
                password_hash=hash_password("cashier123"),
                status="active",
                approved_at=datetime.now(timezone.utc),
            )
            cashiers.append(c)
        db.add_all(cashiers)
        await db.flush()
        print(f"Created {len(cashiers)} cashiers (password: cashier123)")

        # ── DRIVERS ──
        drivers_data = [
            ("Marcus Johnson", "+15557001001", "van", "Ford Transit 2023", "ABC-1234", "White"),
            ("Anna Kowalski", "+15557001002", "sedan", "Toyota Camry 2022", "DEF-5678", "Silver"),
            ("Carlos Rivera", "+15557001003", "suv", "Toyota Highlander 2023", "GHI-9012", "Black"),
            ("Priya Patel", "+15557001004", "van", "Mercedes Sprinter 2022", "JKL-3456", "Gray"),
            ("Robert Kim", "+15557001005", "large_van", "Ford E-450 2021", "MNO-7890", "White"),
        ]
        drivers = []
        for name, phone, vtype, make, plate, color in drivers_data:
            d = Driver(
                name=name, phone=phone, vehicle_type=vtype,
                vehicle_make=make, vehicle_plate=plate, vehicle_color=color,
                email=f"{name.split()[0].lower()}@test.com",
                password_hash=hash_password("driver123"),
                license_number=f"DL-{uuid.uuid4().hex[:8].upper()}",
                has_insurance=True,
                payout_method="bank",
                payout_details={"bank_name": "Chase", "routing": "021000021", "account": "****0001"},
                status="active",
                is_online=True,
                approved_at=datetime.now(timezone.utc),
                last_online_at=datetime.now(timezone.utc),
            )
            drivers.append(d)
        db.add_all(drivers)
        await db.flush()
        print(f"Created {len(drivers)} drivers (password: driver123)")

        # ── UPSALE (active now for testing — applies always, all vehicles) ──
        upsale = Upsale(
            name="Weekend Surge",
            type="flat",
            amount=10.00,
            start_date=None,
            end_date=None,
            daily_start_time=None,
            daily_end_time=None,
            vehicle_types=None,  # all vehicles
            driver_gets_upsale=False,
            cashier_gets_upsale=True,
            is_active=True,
        )
        db.add(upsale)
        await db.flush()
        print("Created 1 active upsale: Weekend Surge (+$10 flat)")

        # ── SAMPLE BOOKINGS ──
        today = date.today()
        tomorrow = today + timedelta(days=1)
        day_after = today + timedelta(days=2)

        # Get vehicle rates for pricing
        rates_result = await db.execute(select(VehicleRate))
        rates = {r.vehicle_type: r for r in rates_result.scalars().all()}

        # Get common routes
        routes_result = await db.execute(select(CommonRoute))
        routes = list(routes_result.scalars().all())

        bookings_data = [
            # (client_name, phone, pickup, dropoff, date, time, vehicle, status, driver_idx, cashier_idx, hotel_idx)
            ("John Smith", "+15551110001", "Marriott Downtown", "Airport", today, time(10, 30), "suv", "completed", 2, 0, 0),
            ("Jane Doe", "+15551110002", "Hilton Garden Inn", "Downtown", today, time(14, 0), "van", "completed", 0, 2, 1),
            ("Bob Wilson", "+15551110003", "Airport", "Hyatt Regency", today, time(16, 30), "sedan", "assigned", 1, None, None),
            ("Alice Brown", "+15551110004", "Marriott Downtown", "Beach Resort", tomorrow, time(9, 0), "van", "paid", None, 1, 0),
            ("Charlie Davis", "+15551110005", "The Crawford Hotel", "Airport", tomorrow, time(11, 0), "large_van", "paid", None, 5, 3),
            ("Diana Evans", "+15551110006", "Airport", "Downtown", tomorrow, time(15, 0), "suv", "paid", None, None, None),
            ("Frank Garcia", "+15551110007", "Hilton Garden Inn", "Airport", day_after, time(8, 0), "sedan", "pending", None, 3, 1),
            ("Grace Lee", "+15551110008", "Hyatt Regency", "Beach Resort", day_after, time(12, 0), "van", "pending", None, 4, 2),
        ]

        for b_data in bookings_data:
            client_name, phone, pickup_name, dropoff_name, p_date, p_time, vtype, status, driver_idx, cashier_idx, hotel_idx = b_data

            rate = rates.get(vtype)
            base = float(rate.base_fare) + 18 * float(rate.per_mile_rate) if rate else 50
            # Check if there's a matching common route for fixed price
            for route in routes:
                if route.to_name.lower() in dropoff_name.lower() and vtype in route.prices:
                    base = float(route.prices[vtype])
                    break

            upsale_amt = 10.0 if upsale.is_active else 0
            extras_amt = 5.0  # room pickup
            total = round(base + extras_amt + upsale_amt, 2)

            booking = Booking(
                booking_number=generate_booking_number(),
                client_name=client_name,
                client_phone=phone,
                client_room=str(100 + bookings_data.index(b_data)),
                pickup_name=pickup_name,
                pickup_address=f"{pickup_name}, Denver, CO",
                pickup_lat=39.74 + (hash(pickup_name) % 20) / 1000,
                pickup_lng=-104.99 + (hash(pickup_name) % 20) / 1000,
                dropoff_name=dropoff_name,
                dropoff_address=f"{dropoff_name}, Denver, CO",
                dropoff_lat=39.74 + (hash(dropoff_name) % 30) / 1000,
                dropoff_lng=-104.99 + (hash(dropoff_name) % 30) / 1000,
                distance_miles=18.0,
                pickup_date=p_date,
                pickup_time=p_time,
                passengers=2,
                luggage="light",
                vehicle_type=vtype,
                base_amount=base,
                extras_amount=extras_amt,
                upsale_amount=upsale_amt,
                total_amount=total,
                upsale_id=upsale.id,
                extras_chosen=["room_pickup"],
                cashier_id=cashiers[cashier_idx].id if cashier_idx is not None else None,
                hotel_id=hotels[hotel_idx].id if hotel_idx is not None else None,
                driver_id=drivers[driver_idx].id if driver_idx is not None else None,
                status=status,
            )

            if status in ("paid", "assigned", "in_progress", "completed"):
                booking.paid_at = datetime.now(timezone.utc) - timedelta(hours=3)
            if status in ("assigned", "in_progress", "completed"):
                booking.assigned_at = datetime.now(timezone.utc) - timedelta(hours=2)
            if status in ("in_progress", "completed"):
                booking.started_at = datetime.now(timezone.utc) - timedelta(hours=1)
                booking.start_location = {"lat": float(booking.pickup_lat), "lng": float(booking.pickup_lng)}
            if status == "completed":
                booking.completed_at = datetime.now(timezone.utc) - timedelta(minutes=30)
                booking.end_location = {"lat": float(booking.dropoff_lat), "lng": float(booking.dropoff_lng)}

            db.add(booking)
            await db.flush()

            # Create payment + splits for paid+ bookings
            if status in ("paid", "assigned", "in_progress", "completed"):
                payment = Payment(
                    booking_id=booking.id,
                    stripe_payment_id=f"dev_pay_{booking.booking_number}",
                    stripe_session_id=f"dev_sess_{booking.booking_number}",
                    amount=total,
                    currency="USD",
                    status="captured",
                )
                db.add(payment)
                await db.flush()

                # Cashier split (immediate)
                cashier_amt = 0
                if booking.cashier_id:
                    cashier_amt = round(total * 0.10, 2)
                    db.add(PaymentSplit(
                        payment_id=payment.id, booking_id=booking.id,
                        recipient_type="cashier", recipient_id=booking.cashier_id,
                        amount=cashier_amt, percentage=10.0,
                        payout_trigger="on_payment", payout_status="released",
                    ))

                # Driver split
                driver_amt = round(base * 0.70, 2)
                driver_payout_status = "pending"
                if status == "completed":
                    driver_payout_status = "pending_review"  # waiting for admin
                db.add(PaymentSplit(
                    payment_id=payment.id, booking_id=booking.id,
                    recipient_type="driver",
                    recipient_id=booking.driver_id,
                    amount=driver_amt, percentage=70.0,
                    payout_trigger="on_release", payout_status=driver_payout_status,
                ))

                # Company split
                company_amt = round(total - cashier_amt - driver_amt, 2)
                db.add(PaymentSplit(
                    payment_id=payment.id, booking_id=booking.id,
                    recipient_type="company", recipient_id=None,
                    amount=company_amt, percentage=round(company_amt / total * 100, 2),
                    payout_trigger="on_release", payout_status="pending",
                ))

            # Update driver stats for completed rides
            if status == "completed" and driver_idx is not None:
                drivers[driver_idx].total_rides += 1

        await db.commit()
        print(f"Created {len(bookings_data)} sample bookings")

        # Summary
        print("\n" + "=" * 50)
        print("DEV SEED COMPLETE")
        print("=" * 50)
        print(f"\nHotels: {len(hotels)}")
        print(f"Cashiers: {len(cashiers)} (login with phone + 'cashier123')")
        print(f"Drivers: {len(drivers)} (login with phone + 'driver123')")
        print(f"Bookings: {len(bookings_data)} (various statuses)")
        print(f"Active upsale: Weekend Surge (+$10)")
        print(f"\n--- Test Accounts ---")
        print(f"Admin: admin@rideflow.com / changeme")
        for d in drivers:
            print(f"Driver: {d.phone} / driver123 ({d.name} - {d.vehicle_type})")
        for c in cashiers:
            print(f"Cashier: {c.phone} / cashier123 ({c.name} - ref: {c.ref_code})")
        print(f"\n--- QR Test URLs ---")
        for c in cashiers:
            print(f"http://localhost:5173/book?ref={c.ref_code}  ({c.name})")


if __name__ == "__main__":
    asyncio.run(seed_dev())
