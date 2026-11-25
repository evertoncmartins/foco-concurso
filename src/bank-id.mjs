// IDs are stable keys and safe filenames; the visible name is independent.
export const validBankId=id=>typeof id==='string'&&/^(?:[a-zA-Z0-9_-]{1,120}|personal_bank_[a-zA-Z0-9_-]{1,120})$/.test(id);
export const validSystemBankId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(id)&&!/^index$/i.test(id)&&!/^personal_bank_/i.test(id);
