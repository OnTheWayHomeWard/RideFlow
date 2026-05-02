"""add missing model columns (driver priority, payment refund, vehicle description)

Revision ID: c3d4e5f6a1b2
Revises: b2c3d4e5f6a1
Create Date: 2026-04-27 03:30:00.000000

Catches up the schema with model fields added without dedicated migrations:
  - drivers.priority_level (1=High, 2=Normal, 3=Low) + index
  - payments.refund_reason, stripe_refund_id, refunded_by (FK)
  - vehicle_rates.description
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3d4e5f6a1b2'
down_revision: Union[str, None] = 'b2c3d4e5f6a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('drivers', sa.Column('priority_level', sa.Integer(), nullable=False, server_default='2'))
    op.create_index('ix_drivers_priority_level', 'drivers', ['priority_level'])

    op.add_column('payments', sa.Column('refund_reason', sa.String(length=500), nullable=True))
    op.add_column('payments', sa.Column('stripe_refund_id', sa.String(length=255), nullable=True))
    op.add_column('payments', sa.Column('refunded_by', sa.UUID(), nullable=True))
    op.create_foreign_key('payments_refunded_by_fkey', 'payments', 'admins', ['refunded_by'], ['id'])

    op.add_column('vehicle_rates', sa.Column('description', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('vehicle_rates', 'description')

    op.drop_constraint('payments_refunded_by_fkey', 'payments', type_='foreignkey')
    op.drop_column('payments', 'refunded_by')
    op.drop_column('payments', 'stripe_refund_id')
    op.drop_column('payments', 'refund_reason')

    op.drop_index('ix_drivers_priority_level', table_name='drivers')
    op.drop_column('drivers', 'priority_level')
