-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "FoundItemStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CLAIMED');

-- CreateEnum
CREATE TYPE "MissingItemStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'FOUND');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('FOUND', 'MISSING');

-- CreateEnum
CREATE TYPE "AssetPurpose" AS ENUM ('FOUND_ITEM_PHOTO', 'MISSING_ITEM_PHOTO', 'CLAIM_EVIDENCE');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('DATA_MIGRATED', 'USER_SIGNED_UP', 'USER_LOGGED_IN', 'FOUND_ITEM_CREATED', 'MISSING_ITEM_CREATED', 'FOUND_ITEM_APPROVED', 'FOUND_ITEM_REJECTED', 'FOUND_ITEM_DELETED', 'FOUND_ITEM_MARKED_CLAIMED', 'MISSING_ITEM_APPROVED', 'MISSING_ITEM_REJECTED', 'MISSING_ITEM_DELETED', 'MISSING_ITEM_MARKED_FOUND', 'CLAIM_CREATED', 'CLAIM_APPROVED', 'CLAIM_REJECTED', 'CLAIM_DELETED', 'MESSAGE_SENT', 'MESSAGE_DELETED', 'ACCOUNT_DELETED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoundItem" (
    "id" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "locationFound" TEXT NOT NULL,
    "dateFound" TIMESTAMP(3) NOT NULL,
    "contactEmailPrivate" TEXT NOT NULL,
    "status" "FoundItemStatus" NOT NULL DEFAULT 'PENDING',
    "submitterName" TEXT NOT NULL,
    "aiProfile" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedById" TEXT NOT NULL,
    "photoAssetId" TEXT,

    CONSTRAINT "FoundItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissingItem" (
    "id" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "lastSeenLocation" TEXT NOT NULL,
    "lastSeenDate" TIMESTAMP(3) NOT NULL,
    "contactEmailPrivate" TEXT NOT NULL,
    "status" "MissingItemStatus" NOT NULL DEFAULT 'PENDING',
    "submitterName" TEXT NOT NULL,
    "aiProfile" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedById" TEXT NOT NULL,
    "photoAssetId" TEXT,

    CONSTRAINT "MissingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemType" "ItemType" NOT NULL,
    "itemName" TEXT NOT NULL,
    "claimerName" TEXT NOT NULL,
    "claimerEmail" TEXT NOT NULL,
    "claimerPhone" TEXT,
    "description" TEXT NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedById" TEXT NOT NULL,
    "ownerId" TEXT,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemType" "ItemType",
    "itemName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "replyToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadedAsset" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT,
    "purpose" "AssetPurpose" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" "AuditAction" NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "FoundItem_status_createdAt_idx" ON "FoundItem"("status", "createdAt");

-- CreateIndex
CREATE INDEX "FoundItem_submittedById_idx" ON "FoundItem"("submittedById");

-- CreateIndex
CREATE INDEX "MissingItem_status_createdAt_idx" ON "MissingItem"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MissingItem_submittedById_idx" ON "MissingItem"("submittedById");

-- CreateIndex
CREATE INDEX "Claim_itemType_itemId_idx" ON "Claim"("itemType", "itemId");

-- CreateIndex
CREATE INDEX "Claim_submittedById_idx" ON "Claim"("submittedById");

-- CreateIndex
CREATE INDEX "Claim_ownerId_idx" ON "Claim"("ownerId");

-- CreateIndex
CREATE INDEX "Message_itemId_idx" ON "Message"("itemId");

-- CreateIndex
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");

-- CreateIndex
CREATE INDEX "Message_receiverId_idx" ON "Message"("receiverId");

-- CreateIndex
CREATE UNIQUE INDEX "UploadedAsset_storedName_key" ON "UploadedAsset"("storedName");

-- CreateIndex
CREATE INDEX "UploadedAsset_ownerId_idx" ON "UploadedAsset"("ownerId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "FoundItem" ADD CONSTRAINT "FoundItem_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoundItem" ADD CONSTRAINT "FoundItem_photoAssetId_fkey" FOREIGN KEY ("photoAssetId") REFERENCES "UploadedAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissingItem" ADD CONSTRAINT "MissingItem_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissingItem" ADD CONSTRAINT "MissingItem_photoAssetId_fkey" FOREIGN KEY ("photoAssetId") REFERENCES "UploadedAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedAsset" ADD CONSTRAINT "UploadedAsset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
