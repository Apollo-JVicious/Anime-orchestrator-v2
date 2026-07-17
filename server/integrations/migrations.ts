import { DatabaseSync } from 'node:sqlite';

export interface IntegrationMigration {
  version: number;
  name: string;
  up: (database: DatabaseSync) => void;
}

const createTables: IntegrationMigration = {
  version: 1,
  name: 'create_integration_tables',
  up(database) {
    database.exec(`
      CREATE TABLE integration_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL CHECK (json_valid(value_json)),
        updated_at TEXT NOT NULL,
        updated_by_admin_session_id TEXT,
        FOREIGN KEY (updated_by_admin_session_id) REFERENCES admin_sessions(id)
      ) STRICT;

      CREATE TABLE admin_sessions (
        id TEXT PRIMARY KEY,
        session_prefix TEXT NOT NULL UNIQUE,
        session_hash TEXT NOT NULL,
        subject TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        last_used_at TEXT
      ) STRICT;

      CREATE TABLE integration_tokens (
        id TEXT PRIMARY KEY,
        token_prefix TEXT NOT NULL UNIQUE,
        token_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        permission TEXT NOT NULL CHECK (permission IN ('read-only', 'read-write')),
        scopes_json TEXT NOT NULL CHECK (json_valid(scopes_json)),
        expires_at TEXT,
        revoked_at TEXT,
        created_at TEXT NOT NULL,
        created_by_admin_session_id TEXT,
        last_used_at TEXT,
        FOREIGN KEY (created_by_admin_session_id) REFERENCES admin_sessions(id)
      ) STRICT;

      CREATE TABLE integration_token_projects (
        token_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (token_id, project_id),
        FOREIGN KEY (token_id) REFERENCES integration_tokens(id) ON DELETE CASCADE
      ) STRICT;

      CREATE TABLE mcp_audit_events (
        id TEXT PRIMARY KEY,
        occurred_at TEXT NOT NULL,
        operation TEXT NOT NULL,
        result TEXT NOT NULL CHECK (result IN ('success', 'denied', 'failure')),
        token_id TEXT,
        admin_session_id TEXT,
        project_id TEXT,
        target_type TEXT,
        target_id TEXT,
        request_id TEXT,
        metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json)),
        FOREIGN KEY (token_id) REFERENCES integration_tokens(id),
        FOREIGN KEY (admin_session_id) REFERENCES admin_sessions(id)
      ) STRICT;

      CREATE TABLE draft_changes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version > 0),
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        source_note TEXT NOT NULL,
        reason TEXT,
        created_by_token_id TEXT,
        created_at TEXT NOT NULL,
        UNIQUE (project_id, entity_type, entity_id, version),
        FOREIGN KEY (created_by_token_id) REFERENCES integration_tokens(id)
      ) STRICT;

      CREATE TABLE canon_change_proposals (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        old_value_json TEXT NOT NULL CHECK (json_valid(old_value_json)),
        proposed_value_json TEXT NOT NULL CHECK (json_valid(proposed_value_json)),
        reason TEXT NOT NULL,
        affected_assets_json TEXT NOT NULL CHECK (json_valid(affected_assets_json)),
        continuity_impact_json TEXT NOT NULL CHECK (json_valid(continuity_impact_json)),
        status TEXT NOT NULL CHECK (status IN ('Pending', 'Approved', 'Rejected')),
        created_by_token_id TEXT,
        created_at TEXT NOT NULL,
        approved_by_token_id TEXT,
        approved_by_admin_session_id TEXT,
        approved_at TEXT,
        FOREIGN KEY (created_by_token_id) REFERENCES integration_tokens(id),
        FOREIGN KEY (approved_by_token_id) REFERENCES integration_tokens(id),
        FOREIGN KEY (approved_by_admin_session_id) REFERENCES admin_sessions(id)
      ) STRICT;

      CREATE TABLE generation_jobs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        shot_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        resolution TEXT NOT NULL,
        duration_seconds REAL NOT NULL CHECK (duration_seconds > 0),
        variation_count INTEGER NOT NULL CHECK (variation_count > 0),
        estimated_cost_micros INTEGER NOT NULL CHECK (estimated_cost_micros >= 0),
        parameters_json TEXT NOT NULL CHECK (json_valid(parameters_json)),
        status TEXT NOT NULL CHECK (
          status IN ('AwaitingConfirmation', 'Queued', 'Running', 'Completed', 'Failed', 'Cancelled')
        ),
        requested_by_token_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        confirmed_at TEXT,
        output_assets_json TEXT NOT NULL CHECK (json_valid(output_assets_json)),
        error_json TEXT NOT NULL CHECK (json_valid(error_json)),
        FOREIGN KEY (requested_by_token_id) REFERENCES integration_tokens(id)
      ) STRICT;

      CREATE TABLE generation_confirmations (
        job_id TEXT PRIMARY KEY,
        token_prefix TEXT NOT NULL UNIQUE,
        token_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        FOREIGN KEY (job_id) REFERENCES generation_jobs(id) ON DELETE CASCADE
      ) STRICT;

      CREATE TABLE webhook_deliveries (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        event_type TEXT NOT NULL,
        endpoint_url TEXT NOT NULL,
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        status TEXT NOT NULL CHECK (status IN ('Pending', 'Delivered', 'Failed')),
        attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
        next_attempt_at TEXT,
        created_at TEXT NOT NULL,
        delivered_at TEXT,
        last_error TEXT
      ) STRICT;
    `);
  },
};

const createIndexes: IntegrationMigration = {
  version: 2,
  name: 'create_integration_indexes',
  up(database) {
    database.exec(`
      CREATE INDEX idx_admin_sessions_active
        ON admin_sessions (expires_at, revoked_at);

      CREATE INDEX idx_integration_tokens_active
        ON integration_tokens (expires_at, revoked_at);

      CREATE INDEX idx_integration_token_projects_project
        ON integration_token_projects (project_id, token_id);

      CREATE INDEX idx_mcp_audit_project_occurred
        ON mcp_audit_events (project_id, occurred_at DESC);

      CREATE INDEX idx_mcp_audit_token_occurred
        ON mcp_audit_events (token_id, occurred_at DESC);

      CREATE INDEX idx_draft_changes_latest
        ON draft_changes (project_id, entity_type, entity_id, version DESC);

      CREATE INDEX idx_canon_proposals_project_status
        ON canon_change_proposals (project_id, status, created_at DESC);

      CREATE INDEX idx_generation_jobs_project_status
        ON generation_jobs (project_id, status, created_at DESC);

      CREATE INDEX idx_generation_confirmations_expiry
        ON generation_confirmations (expires_at, used_at);

      CREATE INDEX idx_webhook_deliveries_pending
        ON webhook_deliveries (status, next_attempt_at, created_at);
    `);
  },
};

const addCanonApplicationOutbox: IntegrationMigration = {
  version: 3,
  name: 'add_canon_application_outbox',
  up(database) {
    database.exec(`
      ALTER TABLE canon_change_proposals
        ADD COLUMN base_version INTEGER NOT NULL DEFAULT 0 CHECK (base_version >= 0);
      ALTER TABLE canon_change_proposals
        ADD COLUMN base_digest TEXT NOT NULL DEFAULT '';
      ALTER TABLE canon_change_proposals
        ADD COLUMN application_status TEXT NOT NULL DEFAULT 'NotApproved'
          CHECK (application_status IN ('NotApproved', 'PendingApply', 'Applied', 'ApplyFailed'));
      ALTER TABLE canon_change_proposals
        ADD COLUMN application_error TEXT;
      ALTER TABLE canon_change_proposals
        ADD COLUMN applied_at TEXT;
      ALTER TABLE canon_change_proposals
        ADD COLUMN new_version INTEGER CHECK (new_version IS NULL OR new_version > 0);

      CREATE TABLE canon_record_versions (
        project_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version > 0),
        proposal_id TEXT NOT NULL UNIQUE,
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        application_status TEXT NOT NULL
          CHECK (application_status IN ('PendingApply', 'Applied', 'ApplyFailed')),
        approved_by_token_id TEXT,
        approved_by_admin_session_id TEXT,
        approved_at TEXT NOT NULL,
        applied_at TEXT,
        application_error TEXT,
        PRIMARY KEY (project_id, entity_type, entity_id, version),
        FOREIGN KEY (proposal_id) REFERENCES canon_change_proposals(id),
        FOREIGN KEY (approved_by_token_id) REFERENCES integration_tokens(id),
        FOREIGN KEY (approved_by_admin_session_id) REFERENCES admin_sessions(id)
      ) STRICT;

      CREATE TABLE canon_current_versions (
        project_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version > 0),
        proposal_id TEXT NOT NULL UNIQUE,
        application_status TEXT NOT NULL
          CHECK (application_status IN ('PendingApply', 'Applied', 'ApplyFailed')),
        updated_at TEXT NOT NULL,
        PRIMARY KEY (project_id, entity_type, entity_id),
        FOREIGN KEY (proposal_id) REFERENCES canon_change_proposals(id)
      ) STRICT;

      CREATE INDEX idx_canon_versions_entity
        ON canon_record_versions (project_id, entity_type, entity_id, version DESC);
      CREATE INDEX idx_canon_versions_application
        ON canon_record_versions (application_status, approved_at);
    `);
  },
};

const addGenerationBudgetReservations: IntegrationMigration = {
  version: 4,
  name: 'add_generation_budget_reservations',
  up(database) {
    database.exec(`
      ALTER TABLE generation_jobs
        ADD COLUMN budget_limit_micros INTEGER NOT NULL DEFAULT 0
          CHECK (budget_limit_micros >= 0);
      ALTER TABLE generation_jobs
        ADD COLUMN budget_spent_snapshot_micros INTEGER NOT NULL DEFAULT 0
          CHECK (budget_spent_snapshot_micros >= 0);

      CREATE INDEX idx_generation_jobs_budget_reservations
        ON generation_jobs (project_id, confirmed_at, status);
    `);
  },
};

export const INTEGRATION_MIGRATIONS: readonly IntegrationMigration[] = [
  createTables,
  createIndexes,
  addCanonApplicationOutbox,
  addGenerationBudgetReservations,
];

/** Apply all unapplied migrations transactionally and in version order. */
export function runIntegrationMigrations(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS integration_schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  const appliedRows = database
    .prepare('SELECT version FROM integration_schema_migrations ORDER BY version')
    .all();
  const appliedVersions = new Set(appliedRows.map((row) => Number(row.version)));
  const knownVersions = new Set(INTEGRATION_MIGRATIONS.map((migration) => migration.version));

  for (const version of appliedVersions) {
    if (!knownVersions.has(version)) {
      throw new Error(
        `Integration database migration ${version} is newer than this application supports.`,
      );
    }
  }

  for (const migration of INTEGRATION_MIGRATIONS) {
    if (appliedVersions.has(migration.version)) continue;

    database.exec('BEGIN IMMEDIATE');
    try {
      migration.up(database);
      database
        .prepare(
          'INSERT INTO integration_schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
        )
        .run(migration.version, migration.name, new Date().toISOString());
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }
}
