import { api } from '../../api/adminClient'
import LocationGroupsEditor from '../../components/admin/LocationGroupsEditor'

const pickupApi = {
  list: () => api.listPickupGroups(),
  create: (data) => api.createPickupGroup(data),
  update: (id, data) => api.updatePickupGroup(id, data),
  delete: (id) => api.deletePickupGroup(id),
  addLocation: (groupId, loc) => api.addPickupGroupLocation(groupId, loc),
  deleteLocation: (groupId, locId) => api.deletePickupGroupLocation(groupId, locId),
}

export default function PickupGroups() {
  return <LocationGroupsEditor mode="pickup" api={pickupApi} />
}
