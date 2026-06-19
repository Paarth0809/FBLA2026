// dto.js — response shaping helpers
//
// These helpers keep private fields out of public API responses. Route handlers
// should return the narrowest shape the caller needs instead of raw records.

function publicFoundItem(item) {
  if (!item) return null;
  return {
    id: item.id,
    itemName: item.itemName,
    category: item.category,
    description: item.description,
    locationFound: item.locationFound,
    dateFound: item.dateFound,
    photo: item.photo || null,
    status: item.status,
    submitterName: item.submitterName || 'Unknown',
    mapFloorId: item.mapFloorId || null,
    mapRoomId: item.mapRoomId || null,
    mapRoomNumber: item.mapRoomNumber || null,
    mapPinX: item.mapPinX ?? null,
    mapPinZ: item.mapPinZ ?? null,
    createdAt: item.createdAt
  };
}

function publicMissingItem(item, currentUser = null) {
  if (!item) return null;
  const isOwner = currentUser && currentUser.id === item.submittedBy;
  return {
    id: item.id,
    itemName: item.itemName,
    category: item.category,
    description: item.description,
    lastSeenLocation: item.lastSeenLocation,
    lastSeenDate: item.lastSeenDate,
    photo: item.photo || null,
    status: item.status,
    submitterName: item.submitterName || 'Unknown',
    canMessageOwner: Boolean(currentUser && !isOwner),
    isOwner: Boolean(isOwner),
    createdAt: item.createdAt
  };
}

module.exports = {
  publicFoundItem,
  publicMissingItem
};
