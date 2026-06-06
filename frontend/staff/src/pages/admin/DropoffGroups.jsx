import { api } from '../../api/adminClient'
import LocationGroupsEditor from '../../components/admin/LocationGroupsEditor'

const dropoffApi = {
  list: () => api.listDropoffGroups(),
  create: (data) => api.createDropoffGroup(data),
  update: (id, data) => api.updateDropoffGroup(id, data),
  delete: (id) => api.deleteDropoffGroup(id),
  addLocation: (groupId, loc) => api.addDropoffGroupLocation(groupId, loc),
  deleteLocation: (groupId, locId) => api.deleteDropoffGroupLocation(groupId, locId),
}

export default function DropoffGroups() {
  return <LocationGroupsEditor mode="dropoff" api={dropoffApi} />
}
