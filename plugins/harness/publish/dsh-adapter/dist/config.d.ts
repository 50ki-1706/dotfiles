/**
 * The publish row's configuration.
 *
 * @module dsh-publish/adapter/config
 */
/** One row's configuration. */
export interface PublishConfig {
    /** Override the command name (default `publish`). */
    command?: {
        name: string;
        description: string;
    };
}
