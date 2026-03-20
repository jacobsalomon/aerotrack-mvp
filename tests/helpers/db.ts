// Test database helper
// Uses DATABASE_URL from environment (same Neon DB, or a test branch if configured).

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
export const testDb = new PrismaClient({ adapter });

/**
 * Create an isolated test organization + user for mobile API tests.
 * Returns the created records so tests can use them directly.
 * Call cleanupTestData() with the returned IDs after the test.
 */
export async function createTestUser() {
  const org = await testDb.organization.create({
    data: {
      name: "Test MRO Facility",
      faaRepairStationCert: "TEST-RS-001",
      address: "123 Test Ave",
      city: "Test City",
      state: "TX",
      zip: "78701",
    },
  });

  const user = await testDb.user.create({
    data: {
      firstName: "Test",
      lastName: "Mechanic",
      email: `test-${Date.now()}@example.com`,
      badgeNumber: `TEST-${Date.now()}`,
      organizationId: org.id,
      apiKey: `test-api-key-${Date.now()}`,
      role: "TECHNICIAN",
      status: "ACTIVE",
    },
  });

  return { org, user };
}

/**
 * Create a test component with a basic lifecycle for testing.
 * Useful for mutation tests that need a component to work with.
 */
export async function createTestComponent() {
  const component = await testDb.component.create({
    data: {
      partNumber: "TEST-001",
      serialNumber: `TEST-SN-${Date.now()}`,
      description: "Test Component for automated testing",
      oem: "Test OEM",
      status: "serviceable",
      manufactureDate: new Date("2024-01-01"),
      currentLocation: "Test Facility",
    },
  });

  return component;
}

/**
 * Create a test alert for mutation testing.
 */
export async function createTestAlert(componentId: string) {
  return testDb.alert.create({
    data: {
      componentId,
      alertType: "overdue_inspection",
      severity: "warning",
      title: "Test Alert",
      description: "This is a test alert for automated testing",
      status: "open",
    },
  });
}

/**
 * Create a test exception for mutation testing.
 */
export async function createTestException(componentId: string) {
  return testDb.exception.create({
    data: {
      componentId,
      exceptionType: "documentation_gap",
      severity: "warning",
      title: "Test Exception",
      description: "This is a test exception for automated testing",
      evidence: JSON.stringify({ test: true }),
      status: "open",
    },
  });
}

/**
 * Clean up test data after mutation tests.
 * Pass in any IDs that were created during the test.
 */
export async function cleanupTestData(ids: {
  componentIds?: string[];
  userIds?: string[];
  orgIds?: string[];
  alertIds?: string[];
  exceptionIds?: string[];
  sessionIds?: string[];
}) {
  // Delete in order that respects foreign key constraints
  if (ids.sessionIds?.length) {
    await testDb.captureSession.deleteMany({
      where: { id: { in: ids.sessionIds } },
    });
  }
  if (ids.alertIds?.length) {
    await testDb.alert.deleteMany({
      where: { id: { in: ids.alertIds } },
    });
  }
  if (ids.exceptionIds?.length) {
    await testDb.exception.deleteMany({
      where: { id: { in: ids.exceptionIds } },
    });
  }
  if (ids.userIds?.length) {
    await testDb.user.deleteMany({
      where: { id: { in: ids.userIds } },
    });
  }
  if (ids.orgIds?.length) {
    await testDb.organization.deleteMany({
      where: { id: { in: ids.orgIds } },
    });
  }
  if (ids.componentIds?.length) {
    // Must delete related records first
    for (const id of ids.componentIds) {
      await testDb.alert.deleteMany({ where: { componentId: id } });
      await testDb.exception.deleteMany({ where: { componentId: id } });
      await testDb.document.deleteMany({ where: { componentId: id } });
      const events = await testDb.lifecycleEvent.findMany({
        where: { componentId: id },
        select: { id: true },
      });
      for (const event of events) {
        await testDb.evidence.deleteMany({
          where: { eventId: event.id },
        });
        await testDb.generatedDocument.deleteMany({
          where: { eventId: event.id },
        });
        await testDb.partConsumed.deleteMany({
          where: { eventId: event.id },
        });
      }
      await testDb.lifecycleEvent.deleteMany({ where: { componentId: id } });
    }
    await testDb.component.deleteMany({
      where: { id: { in: ids.componentIds } },
    });
  }
}
