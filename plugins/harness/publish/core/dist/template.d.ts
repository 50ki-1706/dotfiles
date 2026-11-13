/** One editable region of a pull request template. */
export type Slot = {
    /** Stable field name; unique even when headings repeat. */
    key: string;
    kind: 'text' | 'checkbox';
    /** Offsets into `Template.source`. */
    start: number;
    end: number;
    /** Inline slots must stay on one line; section slots may span lines. */
    context?: 'inline' | 'section';
};
export type Template = {
    /** Repository-relative path, or `null` when the repository has no template. */
    path: string | null;
    source: string;
    /** Changes whenever the path or bytes change, so stale input is detectable. */
    fingerprint: string;
    slots: Slot[];
};
/**
 * Parse a pull request template into fixed text plus editable fields.
 *
 * Headings define section fields, checkboxes and placeholders define inline
 * fields, and empty table cells become inline fields. Fenced or indented code,
 * HTML comments, and inline code stay fixed.
 */
export declare function parseTemplate(path: string | null, source: string): Template;
/** JSON schema for the template's fields, used as the `publish_pr` input. */
export declare function templateSchema(template: Template): Record<string, unknown>;
/** Render template fields into a complete pull request body. */
export declare function renderTemplate(template: Template, values: unknown): string;
