import { v4 as uuidv4 } from 'uuid';
import { Document } from '../../../shared/types';
import { analyzeEncoding } from './defense/encoding-detector.service';
import { analyzeSemanticTriggers } from './defense/semantic-trigger-detector.service';

export class DocumentService {
  private documents: Map<string, Document> = new Map();

  addDocument(name: string, content: string, isPoisoned: boolean = false, attackType?: string): Document {
    const doc: Document = {
      id: uuidv4(),
      name,
      content,
      uploadedAt: new Date(),
      isPoisoned,
      attackType,
    };

    this.documents.set(doc.id, doc);
    return doc;
  }

  getDocument(id: string): Document | undefined {
    return this.documents.get(id);
  }

  getAllDocuments(): Document[] {
    return Array.from(this.documents.values());
  }

  deleteDocument(id: string): boolean {
    return this.documents.delete(id);
  }

  clearAllDocuments(): void {
    this.documents.clear();
  }

  getDocumentsByIds(ids: string[]): Document[] {
    return ids
      .map(id => this.documents.get(id))
      .filter((doc): doc is Document => doc !== undefined);
  }

  concatenateDocuments(ids: string[]): string {
    const docs = this.getDocumentsByIds(ids);
    return docs
      .map(doc => `=== Document: ${doc.name} ===\n\n${doc.content}\n\n`)
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
      const suspiciousBlocks = encodingResult.encodedBlocks.filter(b => b.suspicious);
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
        `combined with bypass instructions ("${semanticResult.bypassMatches[0]}")`
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
    name: string,
    content: string,
    _applyDefense: boolean = false
  ): { document: Document; scanResult?: { isPoisonSuspect: boolean; indicators: string[] } } {
    // Scan for potential poisoning at upload time
    const scanResult = this.scanForPoisoning(content);

    // Add the document regardless — the scan result is informational.
    // Defenses are applied at query time via the defense pipeline.
    const doc = this.addDocument(name, content, false);

    if (scanResult.isPoisonSuspect) {
      console.warn(`⚠️ Document "${name}" flagged as potentially poisoned:`,
        scanResult.indicators.join('; '));
    }

    return { document: doc, scanResult };
  }

  getDocumentStats(): {
    total: number;
    poisoned: number;
    benign: number;
  } {
    const docs = this.getAllDocuments();
    return {
      total: docs.length,
      poisoned: docs.filter(d => d.isPoisoned).length,
      benign: docs.filter(d => !d.isPoisoned).length,
    };
  }
}

export const documentService = new DocumentService();

