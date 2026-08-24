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

/**
 * Greška čija poruka SME da ide korisniku. `createAction` je hvata i vraća kao
 * `ActionResult` sa tom porukom; svaka druga greška ostaje generička (i loguje se),
 * da interni detalji ne procure u UI.
 */
export class ActionError extends Error {
  readonly fieldErrors?: Record<string, string[]>

  constructor(message: string, fieldErrors?: Record<string, string[]>) {
    super(message)
    this.name = 'ActionError'
    this.fieldErrors = fieldErrors
  }
}
