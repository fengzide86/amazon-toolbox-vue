/**
 * Typed desktop composition entry.
 * Legacy automation composition remains isolated behind this boundary while
 * each privileged subsystem is migrated to a typed module.
 */
// @ts-expect-error Legacy composition is intentionally isolated until its
// remaining automation registrations complete the typed migration.
import '../../electron/main.cjs'
