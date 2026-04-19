"""
One-time script to create a super admin for first-time deployment.
Usage:
    docker compose exec backend python -m app.create_admin <email> <password> [name]
Example:
    docker compose exec backend python -m app.create_admin owner@company.com StrongPass123 "Owner Name"
"""
import asyncio
import sys
from sqlalchemy import select
from app.database import async_session
from app.models import Admin
from app.utils.security import hash_password


async def create_admin(email: str, password: str, name: str = "Admin"):
    async with async_session() as db:
        # Check if this email already exists
        existing = await db.execute(select(Admin).where(Admin.email == email))
        if existing.scalar_one_or_none():
            print(f"Admin with email {email} already exists. Aborting.")
            return 1

        admin = Admin(
            name=name,
            email=email,
            password_hash=hash_password(password),
            role="super_admin",
            password_changed=True,
        )
        db.add(admin)
        await db.commit()
        print(f"Created super admin: {email}")
        print(f"  Name: {name}")
        print(f"  Role: super_admin")
        print(f"  Login at your admin portal with this email and password.")
        return 0


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python -m app.create_admin <email> <password> [name]")
        sys.exit(1)
    email = sys.argv[1]
    password = sys.argv[2]
    name = sys.argv[3] if len(sys.argv) > 3 else "Admin"
    code = asyncio.run(create_admin(email, password, name))
    sys.exit(code)
