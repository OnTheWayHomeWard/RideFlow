"""add review featured fields (is_featured + display name/comment overrides)

Revision ID: b2c3d4e5f7a1
Revises: a1b2c3d4e5f7
Create Date: 2026-05-05 13:00:00.000000

Lets the admin curate which reviews are shown publicly on the website
landing page and lightly polish the display copy without changing the
original rating record.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f7a1'
down_revision: Union[str, None] = 'a1b2c3d4e5f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('ratings', sa.Column('is_featured', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('ratings', sa.Column('display_name_override', sa.String(length=100), nullable=True))
    op.add_column('ratings', sa.Column('display_comment_override', sa.Text(), nullable=True))
    op.create_index('ix_ratings_is_featured', 'ratings', ['is_featured'])


def downgrade() -> None:
    op.drop_index('ix_ratings_is_featured', table_name='ratings')
    op.drop_column('ratings', 'display_comment_override')
    op.drop_column('ratings', 'display_name_override')
    op.drop_column('ratings', 'is_featured')
