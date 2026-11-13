/**
 * Ambient type augmentations the adapter relies on.
 *
 * Several dsh services declare their `Context` members through module
 * augmentation in their own packages, so a typecheck only sees
 * `ctx.workingDirectory`, `ApprovalRequestEvent`, and friends when those
 * packages are imported. This module imports them for their side effects and
 * re-exports nothing.
 *
 * @module dsh-publish/dsh-types
 */

import type {} from '@deepseek-ai/dsh-working-directory'
import type {} from '@deepseek-ai/dsh-user-approval/types'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-commands'

export type { ApprovalRequestEvent } from '@deepseek-ai/dsh-user-approval/types'
