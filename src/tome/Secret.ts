import { filter, sampleSize } from "lodash"

export type Mended =          string ;
export type Rended = [string, string];
export type Secret  = Mended | Rended;

export namespace Secret {

  /**************
   * PUBLIC API *
   **************/

  export function random(): string {
    return mend([
      _random(6, _SECRET),
      _random(6, _SECRET)
    ], false)
  }

  export function id(secret: Rended | Mended, filter: boolean = true): string {
    return _isMended(secret) ? rend(secret, filter)[_ID] : filter ? _filter(secret[_ID], _SECRET) : secret[_ID]
  }

  export function pw(secret: Rended | Mended, filter: boolean = true): string {
    return _isMended(secret) ? rend(secret, filter)[_PW] : filter ? _filter(secret[_PW], _SECRET) : secret[_PW]
  }

  export function mend([id , pw]: Rended, filter: boolean = true): Mended {
    id = filter ? _filter(id, _SECRET) : id
    pw = filter ? _filter(pw, _SECRET) : pw
    return `${id}?${pw}`
  }

  export function rend(  secret  : Mended, filter: boolean = true): Rended {
    const t = secret.split("?")
    return [
      t.length > 0 ? filter ? _filter(t[0], _SECRET) : t[0] : "",
      t.length > 1 ? filter ? _filter(t[1], _SECRET) : t[1] : ""
    ]
  }

  /***************
   * PRIVATE API *
   ***************/

  const _SECRET: string = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  const _ID    : number = 0
  const _PW    : number = 1

  function _filter(s: string, include: string): string {
    return filter([...s.toUpperCase()], c => include.includes(c)).join("")
  }

  function _random(n: number, include: string): string {
    return sampleSize([...include], n).join("")
  }

  function _isRended(secret: Rended | Mended): secret is Rended {
    return typeof secret !== "string"
  }

  function _isMended(secret: Rended | Mended): secret is Mended {
    return typeof secret === "string"
  }
}

export default Secret;