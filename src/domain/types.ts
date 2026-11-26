export type Tier = 1 | 2 | 3 | 4
export type Relation = 'self' | 'spouse' | 'child' | 'parent' | 'other'
export type Role = 'holder' | 'dependent'
export type MemberType = 'employee' | 'sponsored' | 'voluntary'
export type Administrator = 'marsh' | 'fhvi' | 'insmart'
export interface BankAccount { bankName: string; accountName: string; accountNumber: string; bankAddress?: string }
export interface Account { id: string; displayName: string; administrator: Administrator; claimEmail: string | null; claimCc: string[]; defaultBank: BankAccount | null; onboardedAt: number | null; updatedAt: number; deleted: 0 | 1 }
export interface Person { id: string; accountId: string; role: Role; relation: Relation; memberType: MemberType; fullName: string; dateOfBirth: string /* YYYY-MM-DD */; idNumber: string | null; phone: string | null; email: string | null; address: string | null; employeeCode: string | null; jobTitle: string | null; tier: Tier; policyholderName: string | null; contractCode: string | null; cardNumber: string | null; cardValidFrom: string | null; cardValidTo: string | null; cardFrontFileId: string | null; cardBackFileId: string | null; bank: BankAccount | null; updatedAt: number; deleted: 0 | 1 }
export type FileOwnerType = 'person' | 'claim' | 'document'
export type FileKind = 'card-front' | 'card-back' | 'document' | 'bundle'
export interface StoredFile { id: string; ownerType: FileOwnerType; ownerId: string; kind: FileKind; mime: string; blob: Blob; bytes: number; sha256: string; createdAt: number; updatedAt: number; deleted: 0 | 1 }
export type PersonInput = Omit<Person, 'id' | 'accountId' | 'updatedAt' | 'deleted' | 'cardFrontFileId' | 'cardBackFileId'> & { id?: string }
