const JAN_CODE_PATTERN = /^(?:[0-9]{8}|[0-9]{13})$/

/**
 * EAN-8 / EAN-13（JAN）の桁数とチェックデジットを検証する。
 */
export function isValidJanCode(code: string): boolean {
  if (!JAN_CODE_PATTERN.test(code)) {
    return false
  }

  const digits = Array.from(code, Number)
  const suppliedCheckDigit = digits.at(-1)

  if (suppliedCheckDigit === undefined) {
    return false
  }

  const dataDigits = digits.slice(0, -1)
  let sum = 0
  let weight = 3

  for (let index = dataDigits.length - 1; index >= 0; index -= 1) {
    sum += dataDigits[index] * weight
    weight = weight === 3 ? 1 : 3
  }

  const expectedCheckDigit = (10 - (sum % 10)) % 10
  return suppliedCheckDigit === expectedCheckDigit
}
