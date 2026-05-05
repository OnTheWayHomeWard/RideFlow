"""add booking event timestamps for reminders + driver action notifications

Revision ID: f6a1b2c3d4e5
Revises: e5f6a1b2c3d4
Create Date: 2026-05-05 00:00:00.000000

Adds 5 nullable timestamp columns to bookings:
  - client_reminder_sent_at        (1-hour-ahead reminder, idempotency key)
  - client_final_reminder_sent_at  (15-min-ahead reminder)
  - driver_reminder_sent_at        (driver pre-ride reminder)
  - driver_on_way_at               (driver tapped "On my way")
  - driver_arrived_at              (driver tapped "I've arrived")
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f6a1b2c3d4e5'
down_revision: Union[str, None] = 'e5f6a1b2c3d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('bookings', sa.Column('client_reminder_sent_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('bookings', sa.Column('client_final_reminder_sent_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('bookings', sa.Column('driver_reminder_sent_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('bookings', sa.Column('driver_on_way_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('bookings', sa.Column('driver_arrived_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('bookings', 'driver_arrived_at')
    op.drop_column('bookings', 'driver_on_way_at')
    op.drop_column('bookings', 'driver_reminder_sent_at')
    op.drop_column('bookings', 'client_final_reminder_sent_at')
    op.drop_column('bookings', 'client_reminder_sent_at')
