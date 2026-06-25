#!/usr/bin/env node

// One-time migration utility for moving the original JSON demo data into Prisma/Postgres.
// It preserves UUIDs, item statuses, photos, claims, and message relationships.
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT, 'data');

function readJSON(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateOnly(value) {
  return parseDate(`${value}T00:00:00.000Z`) || new Date();
}

function enumStatus(value, fallback = 'PENDING') {
  return String(value || fallback).toUpperCase().replace(/-/g, '_');
}

function assetIdFor(storedName) {
  return crypto.createHash('sha256').update(storedName).digest('hex').slice(0, 32);
}

function fileSha256(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to migrate JSON data into PostgreSQL.');
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const users = readJSON('users.json');
  const foundItems = readJSON('items.json');
  const missingItems = readJSON('missing-items.json');
  const claims = readJSON('claims.json');
  const messages = readJSON('messages.json');

  try {
    await client.query('BEGIN');

    for (const user of users) {
      await client.query(
        `INSERT INTO "User" ("id", "name", "email", "passwordHash", "role", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5::"Role", $6, NOW())
         ON CONFLICT ("id") DO UPDATE SET
           "name" = EXCLUDED."name",
           "email" = EXCLUDED."email",
           "passwordHash" = EXCLUDED."passwordHash",
           "role" = EXCLUDED."role",
           "updatedAt" = NOW()`,
        [
          user.id,
          user.name || 'Unknown User',
          String(user.email || '').toLowerCase(),
          user.passwordHash,
          user.role === 'admin' ? 'ADMIN' : 'USER',
          parseDate(user.createdAt) || new Date()
        ]
      );
    }

    const allPhotoRecords = [
      ...foundItems.map(item => ({ item, purpose: 'FOUND_ITEM_PHOTO' })),
      ...missingItems.map(item => ({ item, purpose: 'MISSING_ITEM_PHOTO' }))
    ].filter(entry => entry.item.photo);

    for (const { item, purpose } of allPhotoRecords) {
      const storedName = item.photo;
      const filePath = path.join(ROOT, 'uploads', storedName);
      const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
      const hash = fileSha256(filePath);
      const ownerId = users.some(user => user.id === item.submittedBy) ? item.submittedBy : users[0]?.id;
      if (!ownerId) continue;
      await client.query(
        `INSERT INTO "UploadedAsset" ("id", "ownerId", "originalName", "storedName", "mimeType", "sizeBytes", "sha256", "purpose", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::"AssetPurpose", $9)
         ON CONFLICT ("storedName") DO UPDATE SET
           "ownerId" = EXCLUDED."ownerId",
           "sha256" = EXCLUDED."sha256",
           "purpose" = EXCLUDED."purpose"`,
        [
          assetIdFor(storedName),
          ownerId,
          storedName,
          storedName,
          storedName.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
          stat ? stat.size : 0,
          hash,
          purpose,
          parseDate(item.createdAt) || new Date()
        ]
      );
    }

    for (const item of foundItems) {
      await client.query(
        `INSERT INTO "FoundItem"
          ("id", "itemName", "category", "description", "locationFound", "dateFound", "contactEmailPrivate",
           "status", "submitterName", "aiProfile", "createdAt", "updatedAt", "submittedById", "photoAssetId")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::"FoundItemStatus", $9, $10::jsonb, $11, NOW(), $12, $13)
         ON CONFLICT ("id") DO UPDATE SET
           "itemName" = EXCLUDED."itemName",
           "category" = EXCLUDED."category",
           "description" = EXCLUDED."description",
           "locationFound" = EXCLUDED."locationFound",
           "dateFound" = EXCLUDED."dateFound",
           "contactEmailPrivate" = EXCLUDED."contactEmailPrivate",
           "status" = EXCLUDED."status",
           "submitterName" = EXCLUDED."submitterName",
           "aiProfile" = EXCLUDED."aiProfile",
           "submittedById" = EXCLUDED."submittedById",
           "photoAssetId" = EXCLUDED."photoAssetId",
           "updatedAt" = NOW()`,
        [
          item.id,
          item.itemName,
          item.category,
          item.description,
          item.locationFound,
          dateOnly(item.dateFound),
          item.contactEmail || '',
          enumStatus(item.status),
          item.submitterName || 'Unknown',
          item.aiProfile ? JSON.stringify(item.aiProfile) : null,
          parseDate(item.createdAt) || new Date(),
          item.submittedBy,
          item.photo ? assetIdFor(item.photo) : null
        ]
      );
    }

    for (const item of missingItems) {
      await client.query(
        `INSERT INTO "MissingItem"
          ("id", "itemName", "category", "description", "lastSeenLocation", "lastSeenDate", "contactEmailPrivate",
           "status", "submitterName", "aiProfile", "createdAt", "updatedAt", "submittedById", "photoAssetId")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::"MissingItemStatus", $9, $10::jsonb, $11, NOW(), $12, $13)
         ON CONFLICT ("id") DO UPDATE SET
           "itemName" = EXCLUDED."itemName",
           "category" = EXCLUDED."category",
           "description" = EXCLUDED."description",
           "lastSeenLocation" = EXCLUDED."lastSeenLocation",
           "lastSeenDate" = EXCLUDED."lastSeenDate",
           "contactEmailPrivate" = EXCLUDED."contactEmailPrivate",
           "status" = EXCLUDED."status",
           "submitterName" = EXCLUDED."submitterName",
           "aiProfile" = EXCLUDED."aiProfile",
           "submittedById" = EXCLUDED."submittedById",
           "photoAssetId" = EXCLUDED."photoAssetId",
           "updatedAt" = NOW()`,
        [
          item.id,
          item.itemName,
          item.category,
          item.description,
          item.lastSeenLocation,
          dateOnly(item.lastSeenDate),
          item.contactEmail || '',
          enumStatus(item.status),
          item.submitterName || 'Unknown',
          item.aiProfile ? JSON.stringify(item.aiProfile) : null,
          parseDate(item.createdAt) || new Date(),
          item.submittedBy,
          item.photo ? assetIdFor(item.photo) : null
        ]
      );
    }

    const foundById = new Map(foundItems.map(item => [item.id, item]));
    const missingById = new Map(missingItems.map(item => [item.id, item]));
    for (const claim of claims) {
      const item = claim.itemType === 'missing' ? missingById.get(claim.itemId) : foundById.get(claim.itemId);
      await client.query(
        `INSERT INTO "Claim"
          ("id", "itemId", "itemType", "itemName", "claimerName", "claimerEmail", "claimerPhone",
           "description", "status", "createdAt", "updatedAt", "submittedById", "ownerId")
         VALUES ($1, $2, $3::"ItemType", $4, $5, $6, $7, $8, $9::"ClaimStatus", $10, NOW(), $11, $12)
         ON CONFLICT ("id") DO UPDATE SET
           "status" = EXCLUDED."status",
           "claimerEmail" = EXCLUDED."claimerEmail",
           "claimerPhone" = EXCLUDED."claimerPhone",
           "description" = EXCLUDED."description",
           "ownerId" = EXCLUDED."ownerId",
           "updatedAt" = NOW()`,
        [
          claim.id,
          claim.itemId,
          claim.itemType === 'missing' ? 'MISSING' : 'FOUND',
          claim.itemName || item?.itemName || 'Unknown item',
          claim.claimerName || 'Unknown',
          claim.claimerEmail || '',
          claim.claimerPhone || null,
          claim.description || '',
          enumStatus(claim.status),
          parseDate(claim.createdAt) || new Date(),
          claim.submittedBy,
          item?.submittedBy || null
        ]
      );
    }

    const userByEmail = new Map(users.map(user => [String(user.email).toLowerCase(), user]));
    for (const message of messages) {
      const sender = userByEmail.get(String(message.senderEmail).toLowerCase());
      const receiver = userByEmail.get(String(message.receiverEmail).toLowerCase());
      if (!sender || !receiver) continue;
      const itemType = foundById.has(message.itemId) ? 'FOUND' : missingById.has(message.itemId) ? 'MISSING' : null;
      await client.query(
        `INSERT INTO "Message"
          ("id", "itemId", "itemType", "itemName", "content", "replyToId", "createdAt", "senderId", "receiverId")
         VALUES ($1, $2, $3::"ItemType", $4, $5, $6, $7, $8, $9)
         ON CONFLICT ("id") DO UPDATE SET
           "itemId" = EXCLUDED."itemId",
           "itemType" = EXCLUDED."itemType",
           "itemName" = EXCLUDED."itemName",
           "content" = EXCLUDED."content",
           "replyToId" = EXCLUDED."replyToId",
           "senderId" = EXCLUDED."senderId",
           "receiverId" = EXCLUDED."receiverId"`,
        [
          message.id,
          message.itemId,
          itemType,
          message.itemName || 'Unknown item',
          message.content || '',
          message.replyToId || null,
          parseDate(message.timestamp) || new Date(),
          sender.id,
          receiver.id
        ]
      );
    }

    await client.query(
      `INSERT INTO "AuditLog" ("id", "actorId", "action", "targetType", "targetId", "metadata", "createdAt")
       VALUES ($1, NULL, 'DATA_MIGRATED'::"AuditAction", 'migration', NULL, $2::jsonb, NOW())`,
      [
        crypto.randomUUID(),
        JSON.stringify({
          users: users.length,
          foundItems: foundItems.length,
          missingItems: missingItems.length,
          claims: claims.length,
          messages: messages.length
        })
      ]
    );

    await client.query('COMMIT');
    console.log(`Migrated ${users.length} users, ${foundItems.length} found items, ${missingItems.length} missing items, ${claims.length} claims, ${messages.length} messages.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
