CREATE TABLE "BitrixAppInstallation" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "applicationToken" TEXT,
    "expiresIn" INTEGER,
    "scope" TEXT,
    "status" TEXT,
    "clientEndpoint" TEXT,
    "serverEndpoint" TEXT,
    "connectorId" TEXT,
    "lineId" TEXT,
    "connectorRegisteredAt" TIMESTAMP(3),
    "connectorRegistrationStatus" TEXT,
    "connectorActivatedAt" TIMESTAMP(3),
    "connectorActivationStatus" TEXT,
    "lastError" TEXT,
    "rawPayload" JSONB,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BitrixAppInstallation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BitrixAppInstallation_domain_key" ON "BitrixAppInstallation"("domain");
CREATE UNIQUE INDEX "BitrixAppInstallation_memberId_key" ON "BitrixAppInstallation"("memberId");
CREATE INDEX "BitrixAppInstallation_updatedAt_idx" ON "BitrixAppInstallation"("updatedAt");
