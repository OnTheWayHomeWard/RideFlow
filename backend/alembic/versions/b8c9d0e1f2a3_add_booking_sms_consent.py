"""add bookings.sms_consent

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-05-30 12:00:00.000000

Persists the rider's choice of the OPTIONAL SMS consent checkbox on the
booking form. Default False — existing rows and missing/legacy clients are
treated as not-opted-in. The admin-level sms_override_consent setting can
force-send regardless.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b8c9d0e1f2a3'
down_revision: Union[str, None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'bookings',
        sa.Column('sms_consent', sa.Boolean(), nullable=False, server_default=sa.text('false')),
    )


def downgrade() -> None:
    op.drop_column('bookings', 'sms_consent')
