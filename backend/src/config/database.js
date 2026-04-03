/**
 * Database Configuration
 *
 * Re-export the shared Prisma singleton so legacy imports continue
 * to use the same connection pool.
 */

import prisma from '../prismaClient.js';

export default prisma;
export { prisma };
