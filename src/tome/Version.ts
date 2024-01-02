export class Version {
  readonly moniker: string
  readonly major  : string | number
  readonly minor  : string | number
  readonly patch  : string | number

  constructor(c ?: Partial<Version>) {
    this.moniker = c?.moniker ?? ""
    this.major   = c?.major   ??  0
    this.minor   = c?.minor   ??  0
    this.patch   = c?.patch   ??  0
  }

  toString() {
    return Version.toString(this)
  }
}

export namespace Version {
  export function toString(v: Version) {
    return `${v.moniker} ${v.major}.${v.minor}.${v.patch}`
  }
}

export default Version