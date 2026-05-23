"""add common_routes.bidirectional

Revision ID: d4e5f7a1b2c3
Revises: c3d4e5f7a1b2
Create Date: 2026-05-23 16:00:00.000000

When a route A->B is bidirectional, the system also offers B->A at the same
price (generated virtually, no second row).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e5f7a1b2c3'
down_revision: Union[str, None] = 'c3d4e5f7a1b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('common_routes', sa.Column('bidirectional', sa.Boolean(), nullable=False, server_default=sa.text('true')))


def downgrade() -> None:
    op.drop_column('common_routes', 'bidirectional')
