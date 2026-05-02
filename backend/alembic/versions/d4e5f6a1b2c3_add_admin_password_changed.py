"""add admin.password_changed

Revision ID: d4e5f6a1b2c3
Revises: c3d4e5f6a1b2
Create Date: 2026-04-27 04:00:00.000000

Mirrors the driver/cashier pattern. Defaults to TRUE for any pre-existing rows
(so existing admins aren't suddenly nagged to change their password).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e5f6a1b2c3'
down_revision: Union[str, None] = 'c3d4e5f6a1b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('admins', sa.Column('password_changed', sa.Boolean(), nullable=False, server_default=sa.text('true')))


def downgrade() -> None:
    op.drop_column('admins', 'password_changed')
