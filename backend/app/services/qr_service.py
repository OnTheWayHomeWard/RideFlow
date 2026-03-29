"""
QR Code generation for cashiers.
Generates a styled QR code with cashier name, company branding, and booking URL.
"""
import io
import base64
import qrcode
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.moduledrawers import RoundedModuleDrawer


def generate_cashier_qr(
    ref_code: str,
    cashier_name: str,
    hotel_name: str,
    company_name: str,
    base_url: str = "http://localhost:5173",
) -> str:
    """
    Generate a QR code as base64 PNG string.
    The QR encodes the booking URL with the cashier's ref code.
    """
    url = f"{base_url}/book?ref={ref_code}"

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=12,
        border=2,
    )
    qr.add_data(url)
    qr.make(fit=True)

    img = qr.make_image(
        image_factory=StyledPilImage,
        module_drawer=RoundedModuleDrawer(),
        fill_color="#1e40af",
        back_color="white",
    )

    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    b64 = base64.b64encode(buffer.read()).decode("utf-8")

    return b64
