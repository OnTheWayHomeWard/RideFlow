"""fcm_tokens + notifications tables

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-06-12 10:00:00.000000

Adds:
- fcm_tokens — per-device FCM tokens, attached to a staff user
- notifications — persisted in-app inbox rows (admin/driver/cashier)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, None] = 'd0e1f2a3b4c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'fcm_tokens',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('owner_type', sa.String(20), nullable=False),
        sa.Column('owner_id', UUID(as_uuid=True), nullable=False),
        sa.Column('token', sa.Text, nullable=False),
        sa.Column('user_agent', sa.String(255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('last_used_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('token', name='uq_fcm_tokens_token'),
    )
    op.create_index('ix_fcm_tokens_owner_type', 'fcm_tokens', ['owner_type'])
    op.create_index('ix_fcm_tokens_owner_id', 'fcm_tokens', ['owner_id'])

    op.create_table(
        'notifications',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('recipient_type', sa.String(20), nullable=False),
        sa.Column('recipient_id', UUID(as_uuid=True), nullable=False),
        sa.Column('kind', sa.String(50), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('body', sa.Text, nullable=False),
        sa.Column('link', sa.String(500), nullable=True),
        sa.Column('related_type', sa.String(50), nullable=True),
        sa.Column('related_id', UUID(as_uuid=True), nullable=True),
        sa.Column('is_read', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_notifications_recipient_type', 'notifications', ['recipient_type'])
    op.create_index('ix_notifications_recipient_id', 'notifications', ['recipient_id'])
    op.create_index('ix_notifications_is_read', 'notifications', ['is_read'])
    op.create_index('ix_notifications_created_at', 'notifications', ['created_at'])


def downgrade() -> None:
    op.drop_index('ix_notifications_created_at', table_name='notifications')
    op.drop_index('ix_notifications_is_read', table_name='notifications')
    op.drop_index('ix_notifications_recipient_id', table_name='notifications')
    op.drop_index('ix_notifications_recipient_type', table_name='notifications')
    op.drop_table('notifications')
    op.drop_index('ix_fcm_tokens_owner_id', table_name='fcm_tokens')
    op.drop_index('ix_fcm_tokens_owner_type', table_name='fcm_tokens')
    op.drop_table('fcm_tokens')
