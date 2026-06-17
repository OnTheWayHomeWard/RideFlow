// Admin Notifications inbox — reads the new persisted /api/notifications
// endpoint with read/unread tracking (replaces the old dynamic-feed view).
import { api } from '../../api/adminClient'
import NotificationsInbox from '../../components/NotificationsInbox'

// Server stores admin links as "/admin/runs/{id}" etc., which already match
// the admin portal's React Router paths, so we just pass them through. Falls
// back to null when no link was set so the card is just informational.
const resolveLink = (n) => n.link || null

export default function Notifications() {
  return (
    <NotificationsInbox
      api={api}
      resolveLink={resolveLink}
      emptyHint="You're all caught up. New bookings, contact-form submissions, and driver activity will show up here."
    />
  )
}
