function lowerEnum(value) {
  return String(value || '').toLowerCase();
}

function upperEnum(value) {
  return String(value || '').trim().toUpperCase().replace(/-/g, '_');
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function dateOnly(value) {
  if (!value) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

function parseDateOnly(value) {
  if (!value) return new Date();
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? new Date(value) : date;
}

function userToApi(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    passwordHash: user.passwordHash,
    role: lowerEnum(user.role),
    createdAt: iso(user.createdAt)
  };
}

function foundItemToApi(item) {
  if (!item) return null;
  return {
    id: item.id,
    itemName: item.itemName,
    category: item.category,
    description: item.description,
    locationFound: item.locationFound,
    dateFound: dateOnly(item.dateFound),
    contactEmail: item.contactEmailPrivate,
    photo: item.photoAsset?.storedName || null,
    status: lowerEnum(item.status),
    submittedBy: item.submittedById,
    submitterName: item.submitterName || item.submittedBy?.name || 'Unknown',
    mapFloorId: item.mapFloorId || null,
    mapRoomId: item.mapRoomId || null,
    mapRoomNumber: item.mapRoomNumber || null,
    mapPinX: item.mapPinX ?? null,
    mapPinZ: item.mapPinZ ?? null,
    aiProfile: item.aiProfile || null,
    createdAt: iso(item.createdAt),
    updatedAt: iso(item.updatedAt)
  };
}

function missingItemToApi(item) {
  if (!item) return null;
  return {
    id: item.id,
    itemName: item.itemName,
    category: item.category,
    description: item.description,
    lastSeenLocation: item.lastSeenLocation,
    lastSeenDate: dateOnly(item.lastSeenDate),
    contactEmail: item.contactEmailPrivate,
    photo: item.photoAsset?.storedName || null,
    status: lowerEnum(item.status),
    submittedBy: item.submittedById,
    submitterName: item.submitterName || item.submittedBy?.name || 'Unknown',
    aiProfile: item.aiProfile || null,
    createdAt: iso(item.createdAt),
    updatedAt: iso(item.updatedAt)
  };
}

function claimToApi(claim) {
  if (!claim) return null;
  return {
    id: claim.id,
    itemId: claim.itemId,
    itemType: lowerEnum(claim.itemType),
    itemName: claim.itemName,
    claimerName: claim.claimerName,
    claimerEmail: claim.claimerEmail,
    claimerPhone: claim.claimerPhone || '',
    description: claim.description,
    submittedBy: claim.submittedById,
    ownerId: claim.ownerId || null,
    status: lowerEnum(claim.status),
    createdAt: iso(claim.createdAt),
    updatedAt: iso(claim.updatedAt)
  };
}

function messageToApi(message) {
  if (!message) return null;
  return {
    id: message.id,
    senderEmail: message.sender?.email || '',
    senderName: message.sender?.name || 'Unknown',
    receiverEmail: message.receiver?.email || '',
    receiverName: message.receiver?.name || 'Unknown',
    itemId: message.itemId,
    itemType: message.itemType ? lowerEnum(message.itemType) : null,
    itemName: message.itemName,
    content: message.content,
    replyToId: message.replyToId || null,
    timestamp: iso(message.createdAt)
  };
}

const itemIncludes = {
  submittedBy: true,
  photoAsset: true
};

const claimIncludes = {
  submittedBy: true,
  owner: true
};

const messageIncludes = {
  sender: true,
  receiver: true
};

module.exports = {
  lowerEnum,
  upperEnum,
  iso,
  dateOnly,
  parseDateOnly,
  userToApi,
  foundItemToApi,
  missingItemToApi,
  claimToApi,
  messageToApi,
  itemIncludes,
  claimIncludes,
  messageIncludes
};
