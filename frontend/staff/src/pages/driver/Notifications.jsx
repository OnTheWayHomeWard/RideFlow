import { api } from '../../api/driverClient'
import NotificationsInbox from '../../components/NotificationsInbox'

// The backend stores driver links as "/driver/runs/{id}" — already the
// correct path inside the driver portal.
const resolveLink = (n) => n.link || null

export default function Notifications() {
  return (
    <NotificationsInbox
      api={api}
      resolveLink={resolveLink}
      emptyHint="No notifications yet. You'll get one here whenever a run is assigned to you."
    />
  )
}
