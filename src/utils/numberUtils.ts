import { Decimal } from "@prisma/client/runtime/library";

function isValidNumber(num: any) {
  return !isNaN(Number(num));
}

function decimalToNumber(decimal?: Decimal | null) {
  if (!decimal) return 0;

  return Number(decimal.toString());
}

const NumberUtils = {
  isValidNumber,
  decimalToNumber,
};

export default NumberUtils;
