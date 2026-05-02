"""add concierges, payout_batches, and FK columns

Revision ID: b2c3d4e5f6a1
Revises: a1b2c3d4e5f6
Create Date: 2026-04-27 03:00:00.000000

Catches up the schema with model code that was added without dedicated migrations:
  - concierges table
  - payout_batches table
  - hotels.concierge_id (FK)
  - payment_splits.payout_batch_id (FK + index)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'b2c3d4e5f6a1'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── concierges ──
    op.create_table(
        'concierges',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('phone', sa.String(length=20), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('password_hash', sa.String(length=255), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='active'),
        sa.Column('stripe_connect_id', sa.String(length=255), nullable=True),
        sa.Column('payout_method', sa.String(length=20), nullable=False, server_default='bank'),
        sa.Column('payout_details', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('password_changed', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('total_earnings', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('total_paid_out', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('approved_by', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['approved_by'], ['admins.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('phone'),
    )

    # ── payout_batches ──
    op.create_table(
        'payout_batches',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('recipient_type', sa.String(length=20), nullable=False),
        sa.Column('recipient_id', sa.UUID(), nullable=False),
        sa.Column('total_amount', sa.Numeric(10, 2), nullable=False),
        sa.Column('split_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='processing'),
        sa.Column('stripe_transfer_id', sa.String(length=255), nullable=True),
        sa.Column('stripe_account_id', sa.String(length=255), nullable=True),
        sa.Column('failure_reason', sa.Text(), nullable=True),
        sa.Column('period_start', sa.DateTime(timezone=True), nullable=True),
        sa.Column('period_end', sa.DateTime(timezone=True), nullable=True),
        sa.Column('released_by', sa.UUID(), nullable=True),
        sa.Column('released_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['released_by'], ['admins.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_payout_batches_recipient_type', 'payout_batches', ['recipient_type'])
    op.create_index('ix_payout_batches_recipient_id', 'payout_batches', ['recipient_id'])
    op.create_index('ix_payout_batches_status', 'payout_batches', ['status'])

    # ── hotels.concierge_id ──
    op.add_column('hotels', sa.Column('concierge_id', sa.UUID(), nullable=True))
    op.create_foreign_key('hotels_concierge_id_fkey', 'hotels', 'concierges', ['concierge_id'], ['id'])
    op.create_index('ix_hotels_concierge_id', 'hotels', ['concierge_id'])

    # ── payment_splits.payout_batch_id ──
    op.add_column('payment_splits', sa.Column('payout_batch_id', sa.UUID(), nullable=True))
    op.create_foreign_key('payment_splits_payout_batch_id_fkey', 'payment_splits', 'payout_batches', ['payout_batch_id'], ['id'])
    op.create_index('ix_payment_splits_payout_batch_id', 'payment_splits', ['payout_batch_id'])


def downgrade() -> None:
    op.drop_index('ix_payment_splits_payout_batch_id', table_name='payment_splits')
    op.drop_constraint('payment_splits_payout_batch_id_fkey', 'payment_splits', type_='foreignkey')
    op.drop_column('payment_splits', 'payout_batch_id')

    op.drop_index('ix_hotels_concierge_id', table_name='hotels')
    op.drop_constraint('hotels_concierge_id_fkey', 'hotels', type_='foreignkey')
    op.drop_column('hotels', 'concierge_id')

    op.drop_index('ix_payout_batches_status', table_name='payout_batches')
    op.drop_index('ix_payout_batches_recipient_id', table_name='payout_batches')
    op.drop_index('ix_payout_batches_recipient_type', table_name='payout_batches')
    op.drop_table('payout_batches')

    op.drop_table('concierges')
