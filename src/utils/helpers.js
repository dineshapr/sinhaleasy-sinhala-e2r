export const splitParagraphs = (text) => {
  return text
    .split(/\n{2,}/)
    .map((t) => t.trim())
    .filter((t) => t.length > 10);
};