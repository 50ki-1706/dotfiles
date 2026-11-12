/**
 * The plugin's configuration surface.
 *
 * The bundle declares two rows, both pointing at this plugin, and each row
 * performs one job selected by `role`. Keeping the roles explicit means the
 * guard can be mounted without the adapter and vice versa, which is what makes
 * either half removable on its own.
 *
 * @module dsh-opendesign-toolcall-shim/plugin/config
 */

/** Which job a row performs. */
export type Role = 'adapter' | 'guard'

/** One row's configuration. */
export interface Config {
  /** `adapter` takes over the `llm-pi-ai` row; `guard` installs the argument guard. */
  role: Role
  /** Route the id-keyed adapter owns (adapter role only). */
  provider?: string
  /** `llm-pi-ai` settings namespace the route profiles live in. */
  settingsNamespace?: string
  /** Whether the guard logs each recovery (default true). */
  logRecoveries?: boolean
}

/** The settings namespace the stock `llm-pi-ai` row owns. */
export const DEFAULT_SETTINGS_NAMESPACE = 'llm-pi-ai'

/** The route this shim exists for. */
export const DEFAULT_PROVIDER = 'opendesign'
