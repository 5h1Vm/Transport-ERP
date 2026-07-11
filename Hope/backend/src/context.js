/**
 * Request context — shared per-request helpers that every route module needs.
 *
 * The app is currently single-workspace: getOrganization() returns the one
 * organization (creating it on first use), and getSystemUser() returns the
 * workspace owner used for audit fields (createdById). These are the seams where
 * real multi-tenancy / auth will plug in later.
 */
function createContext(prisma) {
  async function getOrganization() {
    const existing = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
    if (existing) {
      return existing;
    }

    return prisma.organization.create({
      data: {
        name: process.env.ORGANIZATION_NAME || 'Transit Ledger Workspace',
        language: 'en'
      }
    });
  }

  async function getSystemUser(organizationId) {
    const existing = await prisma.user.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'asc' }
    });
    if (existing) {
      return existing;
    }

    return prisma.user.create({
      data: {
        organizationId,
        name: process.env.SYSTEM_USER_NAME || 'Workspace Owner',
        email: process.env.SYSTEM_USER_EMAIL || `owner@${organizationId}.local`,
        phone: null,
        passwordHash: process.env.SYSTEM_USER_PASSWORD_HASH || 'system-placeholder-password',
        role: 'OWNER',
        language: 'en'
      }
    });
  }

  return { prisma, getOrganization, getSystemUser };
}

module.exports = { createContext };
