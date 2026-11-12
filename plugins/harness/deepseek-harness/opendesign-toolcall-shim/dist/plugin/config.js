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
/** The settings namespace the stock `llm-pi-ai` row owns. */
export const DEFAULT_SETTINGS_NAMESPACE = 'llm-pi-ai';
/** The route this shim exists for. */
export const DEFAULT_PROVIDER = 'opendesign';
