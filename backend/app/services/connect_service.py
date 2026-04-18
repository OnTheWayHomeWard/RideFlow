"""
Stripe Connect service — handles Express account onboarding and transfers.
Dev mode: simulates everything when STRIPE_SECRET_KEY is placeholder.
"""
import uuid
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.payment_split import PaymentSplit


def is_dev_mode() -> bool:
    from app.config import settings
    return not settings.STRIPE_SECRET_KEY or settings.STRIPE_SECRET_KEY.startswith("sk_test_placeholder")


async def create_connect_account(entity_type: str, entity_id, email: str | None) -> str:
    """Create a Stripe Express account. Returns the account ID."""
    if is_dev_mode():
        short = str(entity_id)[:8]
        return f"acct_dev_{entity_type}_{short}"

    import stripe
    from app.config import settings
    stripe.api_key = settings.STRIPE_SECRET_KEY

    account = stripe.Account.create(
        type="express",
        email=email,
        metadata={"entity_type": entity_type, "entity_id": str(entity_id)},
    )
    return account.id


async def create_onboarding_link(account_id: str, return_url: str, refresh_url: str) -> str:
    """Generate Stripe onboarding URL for an Express account."""
    if is_dev_mode():
        return f"{return_url}{'&' if '?' in return_url else '?'}dev_onboarding=complete"

    import stripe
    from app.config import settings
    stripe.api_key = settings.STRIPE_SECRET_KEY

    link = stripe.AccountLink.create(
        account=account_id,
        type="account_onboarding",
        return_url=return_url,
        refresh_url=refresh_url,
    )
    return link.url


async def get_account_details(account_id: str) -> dict:
    """Fetch full account details from Stripe. Returns dict with status + user data."""
    if is_dev_mode() or (account_id and account_id.startswith("acct_dev_")):
        return {
            "account_id": account_id,
            "charges_enabled": True,
            "payouts_enabled": True,
            "details_submitted": True,
            "email": "connected@dev.test",
            "name": "Dev Test Account",
            "bank_last4": "0000",
            "bank_name": "Dev Bank",
            "mode": "dev_simulation",
        }

    import stripe
    from app.config import settings
    stripe.api_key = settings.STRIPE_SECRET_KEY

    acct = stripe.Account.retrieve(account_id)

    # Extract bank info
    bank_last4 = bank_name = None
    if acct.external_accounts and acct.external_accounts.data:
        ext = acct.external_accounts.data[0]
        bank_last4 = ext.get("last4")
        bank_name = ext.get("bank_name")

    return {
        "account_id": acct.id,
        "charges_enabled": acct.charges_enabled,
        "payouts_enabled": acct.payouts_enabled,
        "details_submitted": acct.details_submitted,
        "email": acct.email,
        "name": getattr(acct.business_profile, "name", None) or acct.email,
        "bank_last4": bank_last4,
        "bank_name": bank_name,
    }


async def execute_transfer(db: AsyncSession, split: PaymentSplit, destination_account_id: str) -> str:
    """Execute a Stripe Transfer to a connected account. Returns transfer ID."""
    amount_cents = int(float(split.amount) * 100)
    if amount_cents <= 0:
        return ""

    if is_dev_mode():
        short = str(split.id)[:8]
        transfer_id = f"tr_dev_{short}"
        print(f"[STRIPE DEV] Transfer {transfer_id}: ${float(split.amount):.2f} → {destination_account_id}")
        split.stripe_transfer_id = transfer_id
        return transfer_id

    import stripe
    from app.config import settings
    stripe.api_key = settings.STRIPE_SECRET_KEY

    # Use split.id + timestamp for idempotency so retries don't collide with previous failed attempts
    import time
    idem_key = f"split_{split.id}_{int(time.time())}"

    transfer = stripe.Transfer.create(
        amount=amount_cents,
        currency="usd",
        destination=destination_account_id,
        metadata={"split_id": str(split.id), "booking_id": str(split.booking_id)},
        idempotency_key=idem_key,
    )
    split.stripe_transfer_id = transfer.id
    return transfer.id
