const JAN_CODE_PATTERN = /^(?:[0-9]{8}|[0-9]{13})$/

export function isValidJanCode(code: string): boolean {
  if (!JAN_CODE_PATTERN.test(code)) {
    return false
  }

  const digits = Array.from(code, Number)
  const suppliedCheckDigit = digits.at(-1)
  if (suppliedCheckDigit === undefined) {
    return false
  }

  let sum = 0
  let weight = 3
  for (let index = digits.length - 2; index >= 0; index -= 1) {
    sum += digits[index] * weight
    weight = weight === 3 ? 1 : 3
  }

  return suppliedCheckDigit === (10 - (sum % 10)) % 10
}
