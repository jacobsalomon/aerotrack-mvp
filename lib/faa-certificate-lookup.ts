// FAA Airmen Certificate Lookup
// Queries the FAA's public airmen inquiry database to verify
// that a mechanic holds a valid A&P or IA certificate.
//
// The FAA provides a publicly downloadable releasable airmen database,
// but for real-time verification we query their public search endpoint.
// In production, this would use the FAA's official API or a cached
// copy of the releasable database.

import { prisma } from "@/lib/db";

// Certificate types the FAA issues to maintenance personnel
export type FaaCertificateType =
  | "A&P"        // Airframe and Powerplant mechanic
  | "IA"         // Inspection Authorization
  | "Repairman"  // Repairman certificate
  | "Unknown";

export interface FaaLookupResult {
  found: boolean;
  name?: string;
  certificateNumber?: string;
  certificateType?: FaaCertificateType;
  ratings?: string[];
  expirationDate?: string;
  // True if the certificate is currently valid
  isValid?: boolean;
}

// Look up a mechanic's certificate by their FAA certificate number.
// In the MVP, this returns a simulated result based on known demo data.
// In production, this would hit the FAA's Airmen Inquiry API at:
// https://amsrvs.registry.faa.gov/airmeninquiry/
export async function lookupFaaCertificate(
  certificateNumber: string
): Promise<FaaLookupResult> {
  // Demo/seed data lookup — recognized certificate numbers
  // In production, replace with actual FAA API call
  const knownCertificates: Record<string, FaaLookupResult> = {
    "AP-2019-12847": {
      found: true,
      name: "Michael Torres",
      certificateNumber: "AP-2019-12847",
      certificateType: "A&P",
      ratings: ["Airframe", "Powerplant"],
      isValid: true,
    },
    "AP-2015-09421": {
      found: true,
      name: "Sarah Chen",
      certificateNumber: "AP-2015-09421",
      certificateType: "A&P",
      ratings: ["Airframe", "Powerplant"],
      isValid: true,
    },
    "IA-2018-05523": {
      found: true,
      name: "James Rodriguez",
      certificateNumber: "IA-2018-05523",
      certificateType: "IA",
      ratings: ["Airframe", "Powerplant", "Inspection Authorization"],
      isValid: true,
    },
    "AP-2020-18290": {
      found: true,
      name: "David Park",
      certificateNumber: "AP-2020-18290",
      certificateType: "A&P",
      ratings: ["Airframe", "Powerplant"],
      isValid: true,
    },
    "IA-2012-03891": {
      found: true,
      name: "Robert Franklin",
      certificateNumber: "IA-2012-03891",
      certificateType: "IA",
      ratings: ["Airframe", "Powerplant", "Inspection Authorization"],
      expirationDate: "2024-03-31",
      isValid: false, // Expired
    },
  };

  const result = knownCertificates[certificateNumber];
  if (result) return result;

  // Unknown certificate number — in production, this is where
  // the real FAA API call would go
  return { found: false };
}

// Verify a user's FAA certificate and update their record in the database.
// Returns the lookup result and whether the user record was updated.
export async function verifyUserCertificate(
  userId: string,
  certificateNumber: string
): Promise<{
  result: FaaLookupResult;
  updated: boolean;
}> {
  const lookupResult = await lookupFaaCertificate(certificateNumber);

  if (lookupResult.found && lookupResult.isValid) {
    // Update the user record with verified certificate info
    await prisma.user.update({
      where: { id: userId },
      data: {
        faaLicenseNumber: certificateNumber,
        faaLicenseType: lookupResult.certificateType || "Unknown",
        faaLicenseVerifiedAt: new Date(),
      },
    });
    return { result: lookupResult, updated: true };
  }

  return { result: lookupResult, updated: false };
}
