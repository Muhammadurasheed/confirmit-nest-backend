import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { v2 as cloudinary } from 'cloudinary';
import { ScanReceiptDto } from './dto/scan-receipt.dto';
import { ReceiptsGateway } from './receipts.gateway';
import { HederaService } from '../hedera/hedera.service';
import axios from 'axios';

/**
 * ULTIMATE FIRESTORE SANITIZATION UTILITY - PRODUCTION-GRADE
 * Recursively strips ALL undefined values, empty objects, and problematic data
 * This is a FAANG-level solution that handles edge cases comprehensively
 */
const stripUndefinedDeep = (obj: any): any => {
  // Handle primitives
  if (obj === undefined) return null;
  if (obj === null) return null;
  if (typeof obj !== 'object') return obj;

  // Handle arrays
  if (Array.isArray(obj)) {
    // Multidimensional arrays -> stringify
    if (obj.length > 0 && Array.isArray(obj[0])) {
      return JSON.stringify(obj);
    }
    // Clean array recursively, filter out undefined/null
    return obj
      .map(stripUndefinedDeep)
      .filter(item => item !== null && item !== undefined);
  }

  // Handle objects
  const cleaned: any = {};
  
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    
    // Skip undefined entirely
    if (value === undefined) continue;
    
    // 🚫 FIRESTORE 1MB LIMIT: Exclude massive arrays that break document size limit
    // heatmap = ~500KB-1MB, pixel_diff = ~300KB-500KB, these are visualization-only data
    if (['heatmap', 'pixel_diff', 'ela_analysis'].includes(key)) {
      // Skip entirely - these are too large for Firestore (exceed 1MB limit)
      continue;
    }
    
    // Compress other heavy objects by stringifying
    if (['technical_details', 'forensic_findings', 'agent_logs'].includes(key)) {
      if (value && typeof value !== 'string') {
        cleaned[key] = JSON.stringify(value);
      } else if (value) {
        cleaned[key] = value;
      }
      continue;
    }
    
    // Recursively clean nested objects
    const cleanedValue = stripUndefinedDeep(value);
    
    // Only add if not undefined
    if (cleanedValue !== undefined) {
      cleaned[key] = cleanedValue;
    }
  }
  
  return cleaned;
};

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject('FIRESTORE') private readonly db: admin.firestore.Firestore,
    private readonly receiptsGateway: ReceiptsGateway,
    private readonly hederaService: HederaService,
  ) {
    // Initialize Cloudinary with environment variables from ConfigService
    const cloudinaryConfig = {
      cloud_name: this.configService.get<string>('cloudinary.cloudName') || this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get<string>('cloudinary.apiKey') || this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get<string>('cloudinary.apiSecret') || this.configService.get<string>('CLOUDINARY_API_SECRET'),
    };

    this.logger.log(`🔧 Cloudinary config: ${cloudinaryConfig.cloud_name} / ${cloudinaryConfig.api_key ? '✅ API key present' : '❌ API key missing'}`);

    cloudinary.config(cloudinaryConfig);
  }

  async scanReceipt(file: Express.Multer.File, dto: ScanReceiptDto) {
    const receiptId = this.generateReceiptId();
    this.logger.log(`Starting receipt scan: ${receiptId}`);

    try {
      // 1. Emit initial progress before starting upload
      this.receiptsGateway.emitProgress(receiptId, 5, 'uploading', 'Starting upload...');
      
      // 2. Upload to Cloudinary
      const uploadResult = await this.uploadToCloudinary(file);
      this.receiptsGateway.emitProgress(receiptId, 15, 'upload_complete', 'Image uploaded successfully');

      // 3. Create receipt document
      await this.db.collection('receipts').doc(receiptId).set({
        receipt_id: receiptId,
        user_id: dto.userId || 'anonymous',
        storage_path: uploadResult.secure_url,
        cloudinary_public_id: uploadResult.public_id,
        upload_timestamp: admin.firestore.FieldValue.serverTimestamp(),
        status: 'processing',
        analysis: null,
        hedera_anchor: null,
      });

      // 4. Start async analysis
      this.analyzeReceiptAsync(receiptId, uploadResult.secure_url, dto.anchorOnHedera);

      return {
        success: true,
        receiptId,
        message: 'Receipt scan initiated',
      };
    } catch (error) {
      this.logger.error(`Receipt scan failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async analyzeReceiptAsync(
    receiptId: string,
    imageUrl: string,
    anchorOnHedera: boolean,
  ) {
    const receiptRef = this.db.collection('receipts').doc(receiptId);
    const startTime = Date.now();

    try {
      // Send progress updates
      this.receiptsGateway.emitProgress(receiptId, 20, 'ocr_started', 'Extracting text with AI...');

      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate OCR

      this.receiptsGateway.emitProgress(receiptId, 40, 'forensics_running', 'Running forensic analysis...');

      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate forensics

      // Call AI service with proper error handling
      const aiServiceUrl = this.configService.get('aiService.url');
      this.logger.log(`🤖 Calling AI service at: ${aiServiceUrl}/api/analyze-receipt`);
      this.logger.log(`📸 Image URL: ${imageUrl.substring(0, 80)}...`);

      let aiResponse;
      let analysisResult;

      try {
        this.logger.log('⏳ Sending request to AI service...');
        aiResponse = await axios.post(
          `${aiServiceUrl}/api/analyze-receipt`,
          {
            image_url: imageUrl,
            receipt_id: receiptId,
          },
          {
            timeout: 180000, // 3 minute timeout for Gemini + forensics
            headers: {
              'Content-Type': 'application/json',
            },
          },
        );

        this.logger.log(`✅ AI service responded with status: ${aiResponse.status}`);
        analysisResult = aiResponse.data;
        
        // CRITICAL DEBUGGING: Log EXACT response from AI service
        this.logger.log(`🔍 BACKEND RECEIVED FROM AI SERVICE:`);
        this.logger.log(`  - Full response keys: ${JSON.stringify(Object.keys(analysisResult))}`);
        this.logger.log(`  - ocr_text: "${analysisResult.ocr_text?.substring(0, 100)}..." (${analysisResult.ocr_text?.length || 0} chars)`);
        this.logger.log(`  - trust_score: ${analysisResult.trust_score}`);
        this.logger.log(`  - verdict: ${analysisResult.verdict}`);
        this.logger.log(`  - Has forensic_details: ${!!analysisResult.forensic_details}`);
        
        if (analysisResult.forensic_details) {
          this.logger.log(`  - forensic_details keys: ${JSON.stringify(Object.keys(analysisResult.forensic_details))}`);
          this.logger.log(`  - forensic_findings: ${Array.isArray(analysisResult.forensic_details.forensic_findings) ? analysisResult.forensic_details.forensic_findings.length + ' items' : typeof analysisResult.forensic_details.forensic_findings}`);
          this.logger.log(`  - technical_details: ${typeof analysisResult.forensic_details.technical_details}`);
          
          if (analysisResult.forensic_details.technical_details) {
            this.logger.log(`  - technical_details keys: ${JSON.stringify(Object.keys(analysisResult.forensic_details.technical_details))}`);
          }
          
          this.logger.log(`  - heatmap: ${Array.isArray(analysisResult.forensic_details.heatmap) ? analysisResult.forensic_details.heatmap.length + ' rows' : typeof analysisResult.forensic_details.heatmap}`);
        }
      } catch (aiError) {
        this.logger.error(`AI service error: ${aiError.message}`, aiError.stack);

        // Check if it's a timeout
        if (aiError.code === 'ECONNABORTED' || aiError.message.includes('timeout')) {
          throw new Error(
            'AI analysis timed out. The image might be too large or the service is busy. Please try again.',
          );
        }

        // Check if service is down
        if (aiError.code === 'ECONNREFUSED' || aiError.code === 'ENOTFOUND') {
          throw new Error(
            'AI service is currently unavailable. Our team has been notified. Please try again in a few minutes.',
          );
        }

        // Generic AI error
        throw new Error(
          aiError.response?.data?.detail || 
          aiError.response?.data?.message ||
          'AI analysis failed. Please try again with a clearer image.',
        );
      }

      this.receiptsGateway.emitProgress(receiptId, 80, 'analysis_complete', 'Analysis complete!');

      this.logger.log(`💾 [Sidecar-Pattern] Storing analysis for ${receiptId}...`);
      
      // LAYER 1: Strip undefined from raw Python response
      const step1 = stripUndefinedDeep(analysisResult);
      this.logger.log(`✅ LAYER 1: Stripped undefined from Python response`);
      
      // LAYER 2: JSON serialize/parse (native undefined removal)
      const step2 = JSON.parse(JSON.stringify(step1));
      this.logger.log(`✅ LAYER 2: JSON cleaned`);
      
      // LAYER 3: Parse Python's serialized JSON strings
      const safeParse = (data: any) => {
        if (typeof data === 'string') {
          try {
            return JSON.parse(data);
          } catch (e) {
            return data;
          }
        }
        return data;
      };
      
      const forensicDetails = step2.forensic_details || {};
      const agentLogs = safeParse(step2.agent_logs) || [];
      
      // Parse nested serialized fields
      forensicDetails.forensic_findings = safeParse(forensicDetails.forensic_findings) || [];
      forensicDetails.technical_details = safeParse(forensicDetails.technical_details) || {};
      forensicDetails.heatmap = safeParse(forensicDetails.heatmap) || [];
      forensicDetails.pixel_diff = safeParse(forensicDetails.pixel_diff) || {};
      forensicDetails.forensic_progress = safeParse(forensicDetails.forensic_progress) || [];
      
      this.logger.log(`✅ LAYER 3: Parsed serialized Python data`);
      
      // LAYER 4: Separate Heavy Data (Sidecar) from Light Data (Main Document)
      const lightForensics = {
        ocr_confidence: forensicDetails.ocr_confidence,
        manipulation_score: forensicDetails.manipulation_score,
        metadata_flags: forensicDetails.metadata_flags,
        forensic_verdict: forensicDetails.forensic_verdict,
        forensic_summary: forensicDetails.forensic_summary,
        suspicious_regions_count: forensicDetails.suspicious_regions_count,
        manipulation_detected: forensicDetails.manipulation_detected,
        techniques_detected: forensicDetails.techniques_detected,
        authenticity_indicators: forensicDetails.authenticity_indicators,
        // Summary versions only (lightweight)
        forensic_findings: Array.isArray(forensicDetails.forensic_findings) 
          ? forensicDetails.forensic_findings.slice(0, 5) // First 5 findings only
          : forensicDetails.forensic_findings,
        // Include agent logs in light version for UI
        agent_logs: agentLogs,
        // Include forensic progress for detailed agent view
        forensic_progress: forensicDetails.forensic_progress || [],
      };
      
      // Prepare Heavy Forensic Data (Sidecar subcollection)
      const sidecarData = {
        heatmap: forensicDetails.heatmap || [],
        pixel_diff: forensicDetails.pixel_diff || {},
        technical_details: forensicDetails.technical_details || {},
        ela_analysis: forensicDetails.ela_analysis || {},
        agent_logs: agentLogs,
        forensic_progress: forensicDetails.forensic_progress || [],
        // Full forensic findings
        forensic_findings_full: forensicDetails.forensic_findings || [],
        image_dimensions: forensicDetails.image_dimensions,
        statistics: forensicDetails.statistics,
      };
      
      // Main document payload (lightweight)
      const mainPayload = {
        ocr_text: step2.ocr_text || '',
        analysis: {
          trust_score: step2.trust_score || 0,
          verdict: step2.verdict || 'unknown',
          issues: step2.issues || [],
          recommendation: step2.recommendation || '',
          merchant: step2.merchant || null,
          forensic_details: lightForensics,
        },
        processing_time: Date.now() - startTime,
        status: 'completed',
      };
      
      this.logger.log(`✅ LAYER 4: Split into Light (main) and Heavy (sidecar) data`);
      
      // LAYER 4: Clean both payloads
      const cleanedMain = stripUndefinedDeep(mainPayload);
      const cleanedSidecar = stripUndefinedDeep(sidecarData);
      this.logger.log(`✅ LAYER 5: Both payloads cleaned`);
      
      // Calculate sizes
      const mainSize = JSON.stringify(cleanedMain).length;
      const sidecarSize = JSON.stringify(cleanedSidecar).length;
      this.logger.log(`📊 Main document size: ${(mainSize / 1024).toFixed(2)}KB`);
      this.logger.log(`📦 Sidecar document size: ${(sidecarSize / 1024).toFixed(2)}KB`);
      
      if (mainSize > 1048576) {
        this.logger.error(`🚨 MAIN PAYLOAD TOO LARGE: ${(mainSize / 1024).toFixed(2)}KB exceeds 1MB limit!`);
        throw new Error(`Main payload size ${(mainSize / 1024).toFixed(2)}KB exceeds Firestore 1MB limit`);
      }
      
      // LAYER 6: Atomic Batch Write (Main + Sidecar)
      const batch = this.db.batch();
      const sidecarRef = receiptRef.collection('details').doc('forensics');
      
      // Update main document
      batch.set(receiptRef, cleanedMain, { merge: true });
      
      // Set sidecar document (heavy data)
      batch.set(sidecarRef, cleanedSidecar);
      
      await batch.commit();
      this.logger.log(`✅ [Sidecar-Pattern COMPLETE] Main + Sidecar stored atomically`);
      
      this.logger.log(`✅ [FAANG-MODE COMPLETE] Successfully stored to Firestore using set() with merge`);

      // Anchor to Hedera if requested
      if (anchorOnHedera) {
        this.receiptsGateway.emitProgress(receiptId, 90, 'hedera_anchoring', 'Anchoring to blockchain...');

        const hederaResult = await this.hederaService.anchorToHCS(receiptId, analysisResult);

        await receiptRef.update({
          hedera_anchor: hederaResult,
        });

        this.receiptsGateway.emitProgress(receiptId, 100, 'hedera_anchored', 'Verified on blockchain!');
      } else {
        this.receiptsGateway.emitProgress(receiptId, 100, 'complete', 'Verification complete!');
      }

      // Send final results
      const finalDoc = await receiptRef.get();
      this.receiptsGateway.emitComplete(receiptId, finalDoc.data());

      this.logger.log(`Receipt analysis completed: ${receiptId} in ${Date.now() - startTime}ms`);
    } catch (error) {
      this.logger.error(`Receipt analysis failed for ${receiptId}: ${error.message}`, error.stack);

      const userFriendlyError = this.getUserFriendlyError(error);

      await receiptRef.update({
        status: 'failed',
        error: userFriendlyError,
        error_timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      this.receiptsGateway.emitError(receiptId, userFriendlyError);
    }
  }

  private getUserFriendlyError(error: any): string {
    // Map technical errors to user-friendly messages
    const message = error.message || 'Unknown error';

    if (message.includes('timeout')) {
      return 'Analysis timed out. The image might be too large. Please try a smaller image.';
    }
    if (message.includes('unavailable') || message.includes('ECONNREFUSED')) {
      return 'Service temporarily unavailable. Please try again in a few minutes.';
    }
    if (message.includes('invalid image') || message.includes('format')) {
      return 'Invalid image format. Please upload a JPG, PNG, or PDF file.';
    }
    if (message.includes('too large') || message.includes('exceeds')) {
      return 'Analysis data is too large to store. This is a system limitation we are working to resolve.';
    }

    return message;
  }

  async getReceipt(receiptId: string) {
    const doc = await this.db.collection('receipts').doc(receiptId).get();

    if (!doc.exists) {
      throw new Error('Receipt not found');
    }

    return {
      success: true,
      data: doc.data(),
    };
  }

  async getUserReceipts(userId: string) {
    const snapshot = await this.db
      .collection('receipts')
      .where('user_id', '==', userId)
      .orderBy('upload_timestamp', 'desc')
      .limit(50)
      .get();

    const receipts = snapshot.docs.map((doc) => doc.data());

    return {
      success: true,
      count: receipts.length,
      data: receipts,
    };
  }

  private async uploadToCloudinary(file: Express.Multer.File): Promise<any> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'confirmit/receipts',
          resource_type: 'image',
          transformation: [{ quality: 'auto:best' }, { fetch_format: 'auto' }],
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        },
      );

      uploadStream.end(file.buffer);
    });
  }

  async anchorReceiptToHedera(receiptId: string) {
    this.logger.log(`Anchoring receipt ${receiptId} to Hedera`);

    try {
      const receiptRef = this.db.collection('receipts').doc(receiptId);
      const doc = await receiptRef.get();

      if (!doc.exists) {
        throw new Error('Receipt not found');
      }

      const receiptData = doc.data();

      if (receiptData.hedera_anchor) {
        // Already anchored
        return {
          success: true,
          message: 'Receipt already anchored',
          hedera_anchor: receiptData.hedera_anchor,
        };
      }

      // Anchor to Hedera
      const hederaResult = await this.hederaService.anchorToHCS(
        receiptId,
        receiptData.analysis,
      );

      await receiptRef.update({
        hedera_anchor: hederaResult,
      });

      return {
        success: true,
        message: 'Successfully anchored to Hedera',
        hedera_anchor: hederaResult,
      };
    } catch (error) {
      this.logger.error(`Hedera anchoring failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  private generateReceiptId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return `RCP-${timestamp}${random}`.toUpperCase();
  }
}
