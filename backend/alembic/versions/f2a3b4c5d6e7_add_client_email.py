"""add bookings.client_email + make client_phone nullable

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-06-18 10:00:00.000000

Either phone or email is required at the schema layer. Both columns are
nullable so a booking can have just one or the other.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f2a3b4c5d6e7'
down_revision: Union[str, None] = 'e1f2a3b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('bookings', sa.Column('client_email', sa.String(255), nullable=True))
    op.alter_column('bookings', 'client_phone', existing_type=sa.String(20), nullable=True)


def downgrade() -> None:
    # Existing NULL phones can't be reversed back to NOT NULL without picking a placeholder
    op.alter_column('bookings', 'client_phone', existing_type=sa.String(20), nullable=False)
    op.drop_column('bookings', 'client_email')
