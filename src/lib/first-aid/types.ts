export type FirstAidMode = 'controlled' | 'self_service';
export type TransactionKind = 'issue' | 'receive' | 'transfer' | 'dispose';
export type PersonSnapshot = { id?: string | null; code?: string; name: string; department: string; identityMethod?: 'self_declared' };
export type TransactionLine = { itemId: string; quantity: number; lotId?: string };
export type TransactionInput = {
  idempotencyKey: string; kind: TransactionKind; locationId: string; destinationId?: string;
  date: string; lines: TransactionLine[]; expiry?: string | null; lotCode?: string;
  requesterId?: string; recipientId?: string; requesterPerson?: PersonSnapshot; recipientPerson?: PersonSnapshot;
  requester?: PersonSnapshot; onBehalf?: boolean; note?: string;
};

export type FirstAidEmployee = { id: string; code: string; name: string; department: string };

export type FirstAidPermissions = { canManage: boolean; canClinical: boolean; public: boolean };
