export const APPROVED_STAGING_PROJECT_REF: string;
export const SUPERSEDED_HOSTED_MIGRATION_VERSION: string;

export type HostedStagingConfig = {
  supabaseUrl: string;
  projectRef: string;
  approvedProjectRef: string;
  publishableKey: string;
  serviceRoleKey: string;
  appOrigin: string;
  dbUrl: string | null;
};

export type ValidatedStagingDbTarget = {
  mode: 'direct' | 'pooler';
  host: string;
  projectRef: string;
};

export type ValidatedMigrationRepairConfirmation = {
  projectRef: string;
  migrationVersion: string;
};

export type SmokeAdminState = {
  userId: string;
  email: string;
  password: string;
  factorId?: string;
  totpSecret?: string;
  storageState?: unknown;
};

export function loadStagingEnv(cwd?: string): Record<string, string | undefined>;
export function extractSupabaseProjectRef(supabaseUrl: string | undefined): {
  origin: string;
  projectRef: string;
};
export function validateHostedAppOrigin(originRaw: string | undefined): string;
export function validateStagingDbUrl(
  dbUrl: string | null | undefined,
  expectedProjectRef?: string,
): ValidatedStagingDbTarget;
export function requireMigrationRepairConfirmation(
  cliArgs: readonly string[],
  expectedProjectRef?: string,
  migrationVersion?: string,
): ValidatedMigrationRepairConfirmation;
export function requireSmokeAdminState(adminState: unknown): SmokeAdminState;
export function loadSmokeAdminState(adminStatePath: string): SmokeAdminState;
export function requireHostedStagingConfig(
  env: Record<string, string | undefined>,
  options?: { approvedProjectRef?: string },
): HostedStagingConfig;
