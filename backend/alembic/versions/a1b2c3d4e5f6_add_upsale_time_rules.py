"""add upsale time rules (date range + daily time-of-day)

Revision ID: a1b2c3d4e5f6
Revises: d4fb04e2e7b4
Create Date: 2026-04-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'd4fb04e2e7b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('upsales', sa.Column('start_date', sa.Date(), nullable=True))
    op.add_column('upsales', sa.Column('end_date', sa.Date(), nullable=True))
    op.add_column('upsales', sa.Column('daily_start_time', sa.Time(), nullable=True))
    op.add_column('upsales', sa.Column('daily_end_time', sa.Time(), nullable=True))

    # Migrate existing data: start_time/end_time (datetime) → start_date/end_date
    op.execute("UPDATE upsales SET start_date = start_time::date, end_date = end_time::date")

    op.alter_column('upsales', 'start_time', nullable=True)
    op.alter_column('upsales', 'end_time', nullable=True)
    op.drop_column('upsales', 'start_time')
    op.drop_column('upsales', 'end_time')


def downgrade() -> None:
    op.add_column('upsales', sa.Column('start_time', sa.DateTime(timezone=True), nullable=True))
    op.add_column('upsales', sa.Column('end_time', sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE upsales SET start_time = start_date::timestamptz, end_time = end_date::timestamptz")
    op.alter_column('upsales', 'start_time', nullable=False)
    op.alter_column('upsales', 'end_time', nullable=False)
    op.drop_column('upsales', 'daily_end_time')
    op.drop_column('upsales', 'daily_start_time')
    op.drop_column('upsales', 'end_date')
    op.drop_column('upsales', 'start_date')
