/** Navidrome treats `Alice` and `alice` as one login, so anything keyed by account must too. */
export const accountName = (user: string): string => user.trim().toLowerCase();
