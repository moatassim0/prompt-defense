import { v4 as uuidv4 } from 'uuid';
import { Document } from '../../../shared/types';
import { analyzeEncoding } from './defense/encoding-detector.service';
import { analyzeSemanticTriggers } from './defense/semantic-trigger-detector.service';

export class DocumentService {
  private documentsByUser: Map<string, Map<string, Document>> = new Map();

  private userStore(userId: string): Map<string, Document> {
    let store = this.documentsByUser.get(userId);
    if (!store) {
      store = new Map();
      this.documentsByUser.set(userId, store);
    }
    return store;
  }

  addDocument(
    userId: string,
    name: string,
    content: string,
    isPoisoned: boolean = false,
    attackType?: string,
    untrustedUpload: boolean = false,
  ): Document {
    const doc: Document = {
      id: uuidv4(),
      name,
      content,
      uploadedAt: new Date(),
      isPoisoned,
      attackType,
      untrustedUpload: untrustedUpload || undefined,
    };

    this.userStore(userId).set(doc.id, doc);
    return doc;
  }

  getDocument(userId: string, id: string): Document | undefined {
    return this.userStore(userId).get(id);
  }

  getAllDocuments(userId: string): Document[] {
    return Array.from(this.userStore(userId).values());
  }

  deleteDocument(userId: string, id: string): boolean {
    return this.userStore(userId).delete(id);
  }

  clearAllDocuments(userId: string): void {
    this.userStore(userId).clear();
  }

  getDocumentsByIds(userId: string, ids: string[]): Document[] {
    const store = this.userStore(userId);
    return ids
      .map((id) => store.get(id))
      .filter((doc): doc is Document => doc !== undefined);
  }

  concatenateDocuments(userId: string, ids: string[]): string {
    const docs = this.getDocumentsByIds(userId, ids);
    return docs
      .map((doc) => `=== Document: ${doc.name} ===\n\n${doc.content}\n\n`)
      .join('');
  }

  /**
   * Scans document content for potential poisoning indicators.
   * Runs encoding detector + semantic trigger detector against the content.
   */
  scanForPoisoning(content: string): { isPoisonSuspect: boolean; indicators: string[] } {
    const indicators: string[] = [];

    // Check for encoded/obfuscated content
    const encodingResult = analyzeEncoding(content);
    if (encodingResult.hasEncodedContent) {
      const suspiciousBlocks = encodingResult.encodedBlocks.filter((b) => b.suspicious);
      if (suspiciousBlocks.length > 0) {
        indicators.push(`Suspicious encoded content found (${suspiciousBlocks.length} blocks with injection keywords)`);
      }
      if (encodingResult.hasDecodeInstructions) {
        indicators.push('Document contains "decode and follow" instruction language');
      }
    }

    // Check for semantic backdoor patterns
    const semanticResult = analyzeSemanticTriggers(content);
    if (semanticResult.hasAuthorityEstablishment && semanticResult.hasBypassInstructions) {
      indicators.push(
        `Semantic backdoor detected: authority establishment ("${semanticResult.authorityMatches[0]}") ` +
        `combined with bypass instructions ("${semanticResult.bypassMatches[0]}")`,
      );
    }
    if (semanticResult.hasFabricatedCitations) {
      indicators.push(`Fabricated citations detected: "${semanticResult.citationMatches[0]}"`);
    }

    return {
      isPoisonSuspect: indicators.length > 0,
      indicators,
    };
  }

  sanitizeAndAddDocument(
    userId: string,
    name: string,
    content: string,
    _applyDefense: boolean = false,
  ): { document: Document; scanResult?: { isPoisonSuspect: boolean; indicators: string[] } } {
    // Scan for potential poisoning at upload time
    const scanResult = this.scanForPoisoning(content);

    // Add the document regardless — the scan result is informational.
    // Defenses are applied at query time via the defense pipeline.
    // Any .txt from an upload is unknown provenance → untrustedUpload for UI + simulator clean baseline.
    const doc = this.addDocument(userId, name, content, false, undefined, true);

    if (scanResult.isPoisonSuspect) {
      console.warn(`⚠️ Document "${name}" flagged as potentially poisoned:`,
        scanResult.indicators.join('; '));
    }

    return { document: doc, scanResult };
  }

  getDocumentStats(userId: string): {
    total: number;
    poisoned: number;
    benign: number;
    untrustedUploads: number;
  } {
    const docs = this.getAllDocuments(userId);
    return {
      total: docs.length,
      poisoned: docs.filter((d) => d.isPoisoned).length,
      benign: docs.filter((d) => !d.isPoisoned && !d.untrustedUpload).length,
      untrustedUploads: docs.filter((d) => d.untrustedUpload).length,
    };
  }
}

export const documentService = new DocumentService();
