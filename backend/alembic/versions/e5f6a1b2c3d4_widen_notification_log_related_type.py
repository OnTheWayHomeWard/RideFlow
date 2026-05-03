"""widen notification_log.related_type to varchar(50)

Revision ID: e5f6a1b2c3d4
Revises: d4e5f6a1b2c3
Create Date: 2026-05-03 00:00:00.000000

The model declared String(50) but the initial migration created VARCHAR(20),
which truncated values like 'driver_ride_completed' (21) and rolled back the
parent transaction on ride-complete.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e5f6a1b2c3d4'
down_revision: Union[str, None] = 'd4e5f6a1b2c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('notification_log', 'related_type',
                    existing_type=sa.String(length=20),
                    type_=sa.String(length=50),
                    existing_nullable=True)


def downgrade() -> None:
    op.alter_column('notification_log', 'related_type',
                    existing_type=sa.String(length=50),
                    type_=sa.String(length=20),
                    existing_nullable=True)
