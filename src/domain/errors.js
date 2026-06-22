export class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

export function assertRule(condition, code, message) {
  if (!condition) {
    throw new DomainError(code, message);
  }
}
