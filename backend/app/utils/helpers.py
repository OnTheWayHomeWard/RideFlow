import random
import string
from datetime import date


def generate_booking_number() -> str:
    today = date.today().strftime("%Y%m%d")
    suffix = "".join(random.choices(string.digits, k=4))
    return f"RF-{today}-{suffix}"


def generate_ref_code() -> str:
    chars = string.ascii_uppercase + string.digits
    return "".join(random.choices(chars, k=8))
