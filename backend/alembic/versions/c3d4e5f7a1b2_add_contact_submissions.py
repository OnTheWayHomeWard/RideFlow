"""add contact_submissions table

Revision ID: c3d4e5f7a1b2
Revises: b2c3d4e5f7a1
Create Date: 2026-05-05 13:30:00.000000

Stores submissions from the public website's contact form.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3d4e5f7a1b2'
down_revision: Union[str, None] = 'b2c3d4e5f7a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'contact_submissions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('phone', sa.String(length=20), nullable=True),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='new'),
        sa.Column('admin_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('replied_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('handled_by', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['handled_by'], ['admins.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_contact_submissions_status', 'contact_submissions', ['status'])
    op.create_index('ix_contact_submissions_created_at', 'contact_submissions', ['created_at'])


def downgrade() -> None:
    op.drop_index('ix_contact_submissions_created_at', table_name='contact_submissions')
    op.drop_index('ix_contact_submissions_status', table_name='contact_submissions')
    op.drop_table('contact_submissions')
