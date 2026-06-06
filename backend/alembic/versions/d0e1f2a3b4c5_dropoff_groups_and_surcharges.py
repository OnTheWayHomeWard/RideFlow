"""dropoff groups + silent surcharges on pickup/dropoff groups + bookings

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-06-06 22:30:00.000000

- Adds pickup_groups.surcharge_amount (silent surcharge applied when the
  rider's pickup matches the group).
- Creates dropoff_groups + dropoff_group_locations (mirror of pickup_groups,
  matched against the dropoff coords).
- Adds bookings.pickup_surcharge / dropoff_surcharge so the silent surcharge
  applied to each booking is recorded for audit/reporting.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


revision: str = 'd0e1f2a3b4c5'
down_revision: Union[str, None] = 'c9d0e1f2a3b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # surcharge on existing pickup_groups
    op.add_column(
        'pickup_groups',
        sa.Column('surcharge_amount', sa.Numeric(10, 2), nullable=False, server_default='0'),
    )

    # dropoff_groups — mirror of pickup_groups
    op.create_table(
        'dropoff_groups',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('forced_extra_slugs', JSONB, nullable=False, server_default="[]"),
        sa.Column('surcharge_amount', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        'dropoff_group_locations',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('group_id', UUID(as_uuid=True), sa.ForeignKey('dropoff_groups.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('address', sa.Text, nullable=True),
        sa.Column('lat', sa.Numeric(10, 7), nullable=False),
        sa.Column('lng', sa.Numeric(10, 7), nullable=False),
        sa.Column('radius_meters', sa.Integer, nullable=False, server_default='500'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_dropoff_group_locations_group_id', 'dropoff_group_locations', ['group_id'])

    # Audit columns on bookings
    op.add_column('bookings', sa.Column('pickup_surcharge', sa.Numeric(10, 2), nullable=False, server_default='0'))
    op.add_column('bookings', sa.Column('dropoff_surcharge', sa.Numeric(10, 2), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('bookings', 'dropoff_surcharge')
    op.drop_column('bookings', 'pickup_surcharge')
    op.drop_index('ix_dropoff_group_locations_group_id', table_name='dropoff_group_locations')
    op.drop_table('dropoff_group_locations')
    op.drop_table('dropoff_groups')
    op.drop_column('pickup_groups', 'surcharge_amount')
