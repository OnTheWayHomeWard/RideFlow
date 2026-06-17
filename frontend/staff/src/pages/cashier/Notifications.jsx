import { api } from '../../api/cashierClient'
import NotificationsInbox from '../../components/NotificationsInbox'

const resolveLink = (n) => n.link || null

export default function Notifications() {
  return (
    <NotificationsInbox
      api={api}
      resolveLink={resolveLink}
      emptyHint="No notifications yet. Booking and payout activity will show up here."
    />
  )
}
