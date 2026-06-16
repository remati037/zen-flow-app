/**
 * Jedinstven rezultat svake server akcije.
 * Klijent diskriminira po `ok` polju — nikad ne baca sirovu grešku ka UI-u.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }

export const actionOk = <T>(data: T): ActionResult<T> => ({ ok: true, data })

export const actionError = (
  error: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult<never> => ({ ok: false, error, fieldErrors })
