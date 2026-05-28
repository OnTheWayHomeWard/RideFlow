"""add vehicle_rates.rate_tiers

Revision ID: a7b8c9d0e1f2
Revises: d4e5f7a1b2c3
Create Date: 2026-05-28 12:00:00.000000

Adds an optional distance-tier pricing list per vehicle. JSONB list of
{to: number|null, rate: number} sorted ascending; the last tier's `to` is null
("and up"). Empty list falls back to per_mile_rate.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, None] = 'd4e5f7a1b2c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'vehicle_rates',
        sa.Column('rate_tiers', JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
    )


def downgrade() -> None:
    op.drop_column('vehicle_rates', 'rate_tiers')
