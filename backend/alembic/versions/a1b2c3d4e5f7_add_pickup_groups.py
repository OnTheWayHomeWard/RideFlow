"""add pickup_groups + pickup_group_locations

Revision ID: a1b2c3d4e5f7
Revises: f6a1b2c3d4e5
Create Date: 2026-05-05 12:00:00.000000

Lets the admin define groups of pickup locations (e.g. "Airports") and a list
of extras that auto-apply when a booking's pickup falls inside the group's
radius. The client can't uncheck forced extras.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'a1b2c3d4e5f7'
down_revision: Union[str, None] = 'f6a1b2c3d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'pickup_groups',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('forced_extra_slugs', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='[]'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'pickup_group_locations',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('group_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('lat', sa.Numeric(10, 7), nullable=False),
        sa.Column('lng', sa.Numeric(10, 7), nullable=False),
        sa.Column('radius_meters', sa.Integer(), nullable=False, server_default='500'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['group_id'], ['pickup_groups.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_pickup_group_locations_group_id', 'pickup_group_locations', ['group_id'])


def downgrade() -> None:
    op.drop_index('ix_pickup_group_locations_group_id', table_name='pickup_group_locations')
    op.drop_table('pickup_group_locations')
    op.drop_table('pickup_groups')
