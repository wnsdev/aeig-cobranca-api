/**
 * Validação de mês de referência (formato AAAA-MM e mês entre 01 e 12)
 */
export function isValidMonthReference(mes: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    return false;
  }
  return true;
}

/**
 * Validação estrita de data real do calendário gregoriano (formato AAAA-MM-DD)
 * Rejeita dias inválidos como 2026-02-29 ou 2026-04-31.
 */
export function isValidCalendarDate(dataStr: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(dataStr)) {
    return false;
  }

  const [ano, mes, dia] = dataStr.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));

  return (
    data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === dia
  );
}
