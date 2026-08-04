import { createHash } from 'node:crypto'

export type SignableValue = string | number | boolean | SignableValue[] | null | undefined
export type SignableParameters = Record<string, SignableValue>

function isEmpty(value: SignableValue): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  )
}

function serializeValue(value: Exclude<SignableValue, null | undefined>): string {
  if (Array.isArray(value)) {
    return value.map((item) => serializeValue(item as Exclude<SignableValue, null | undefined>)).join(',')
  }

  return String(value)
}

function formEncode(value: string): string {
  return new URLSearchParams([['value', value]]).toString().slice('value='.length)
}

export function createSignatureBase(parameters: SignableParameters): string {
  return Object.entries(parameters)
    .filter(([key, value]) => key !== 'sign' && key !== 'secret' && !isEmpty(value))
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${formEncode(key)}=${formEncode(serializeValue(value!))}`)
    .join('&')
}

export function signPoizonRequest(
  parameters: SignableParameters,
  appSecret: string,
): string {
  const signatureBase = createSignatureBase(parameters)
  return createHash('md5').update(`${signatureBase}${appSecret}`, 'utf8').digest('hex').toUpperCase()
}
