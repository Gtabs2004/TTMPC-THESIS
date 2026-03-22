export const TIN_DIGIT_LIMIT = 12;
export const TIN_FORMATTED_MAX_LENGTH = 15;

export const formatTinNumber = (value) => {
  const digits = String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, TIN_DIGIT_LIMIT);

  const chunks = digits.match(/.{1,3}/g);
  return chunks ? chunks.join('-') : '';
};