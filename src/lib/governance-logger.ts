import { adminDb } from './admin';
import { v4 as uuidv4 } from 'uuid';
import { logEvent } from './logger';

export interface LedgerEntry {
  transactionId: string;
  source: 'INCENTIVE' | 'GRANT' | 'REIMBURSEMENT';
  entityId: string; // claimId, projectId, etc.
  userId: string;
  amount: number;
  type: 'DEBIT' | 'CREDIT';
  status: 'PROCESSED' | 'REVERSED';
  timestamp: any;
  metadata?: Record<string, any>;
}

export interface EntityChange {
  entityId: string;
  entityType: 'PROJECT' | 'CLAIM' | 'USER_CONFIG' | 'SYSTEM_SETTINGS';
  changedBy: string;
  timestamp: any;
  before: Record<string, any>;
  after: Record<string, any>;
  diff: Record<string, any>;
}

export interface PolicyTrace {
  policyName: string;
  entityId: string;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  logicVersion: string;
  timestamp: any;
}

/**
 * Enhanced Governance Logger for Financial and Regulatory Compliance.
 */
export const GovernanceLogger = {
  /**
   * Prepares a financial ledger entry for use in a Firestore batch or transaction.
   */
  prepareFinancialLedger(entry: Omit<LedgerEntry, 'transactionId' | 'timestamp'>) {
    const transactionId = `TXN-${uuidv4().substring(0, 8).toUpperCase()}`;
    const ledgerEntry: LedgerEntry = {
      ...entry,
      transactionId,
      timestamp: new Date(),
    };
    return {
      ref: adminDb.collection('financial_ledger').doc(transactionId),
      data: ledgerEntry,
      transactionId
    };
  },

  /**
   * Records an immutable financial transaction in the ledger.
   */
  async logFinancialLedger(entry: Omit<LedgerEntry, 'transactionId' | 'timestamp'>) {
    const { ref, data, transactionId } = this.prepareFinancialLedger(entry);

    try {
      await ref.set(data);
      await logEvent('AUDIT', `Financial Ledger Entry: ${transactionId}`, {
        metadata: { transactionId, source: entry.source, amount: entry.amount, entityId: entry.entityId },
        status: 'success'
      });
      return transactionId;
    } catch (error) {
      console.error('FAILED_LEDGER_WRITE:', error);
      throw new Error('Critical: Financial ledger write failed. Aborting transaction.');
    }
  },

  /**
   * Tracks state evolution and field-level changes for critical entities.
   */
  async logEntityChange(
    entityId: string, 
    entityType: EntityChange['entityType'], 
    changedBy: string, 
    before: Record<string, any>, 
    after: Record<string, any>
  ) {
    const diff: Record<string, any> = {};
    for (const key in after) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        diff[key] = { from: before[key], to: after[key] };
      }
    }

    if (Object.keys(diff).length === 0) return;

    const changeRecord: EntityChange = {
      entityId,
      entityType,
      changedBy,
      timestamp: new Date(),
      before,
      after,
      diff
    };

    try {
      await adminDb.collection('change_history').add(changeRecord);
      await logEvent('AUDIT', `${entityType} state changed: ${entityId}`, {
        metadata: { entityId, entityType, fieldsChanged: Object.keys(diff) },
        status: 'info'
      });
    } catch (error) {
      console.error('FAILED_HISTORY_WRITE:', error);
    }
  },

  /**
   * Records the execution of a policy or business rule (e.g., incentive calculation).
   */
  async logPolicyTrace(trace: Omit<PolicyTrace, 'timestamp'>) {
    const policyTrace: PolicyTrace = {
      ...trace,
      timestamp: new Date()
    };

    try {
      await adminDb.collection('policy_traces').add(policyTrace);
    } catch (error) {
      console.error('FAILED_POLICY_TRACE:', error);
    }
  },

  /**
   * Audit passive reads of sensitive documents or data.
   */
  async logAccessAudit(userId: string, resourceId: string, action: 'READ' | 'DOWNLOAD', metadata?: any) {
    try {
      await adminDb.collection('access_audit').add({
        userId,
        resourceId,
        action,
        timestamp: new Date(),
        metadata
      });
      await logEvent('SECURITY', `Sensitive access: ${action} on ${resourceId}`, {
        metadata: { userId, resourceId, action, ...metadata },
        status: 'warning'
      });
    } catch (error) {
      console.error('FAILED_ACCESS_AUDIT:', error);
    }
  }
};
