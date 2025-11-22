import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class BusinessPaymentService {
  private readonly logger = new Logger(BusinessPaymentService.name);
  private readonly paystackSecretKey: string;
  private readonly paystackBaseUrl = 'https://api.paystack.co';

  constructor(private readonly configService: ConfigService) {
    this.paystackSecretKey = this.configService.get<string>('PAYSTACK_SECRET_KEY');
  }

  /**
   * Initialize Paystack payment
   */
  async initializePaystackPayment(
    email: string,
    amount: number, // in kobo (₦25,000 = 2500000 kobo)
    businessId: string,
    metadata: any = {},
  ) {
    this.logger.log(`Initializing Paystack payment for ${businessId}: ₦${amount / 100}`);

    try {
      const response = await axios.post(
        `${this.paystackBaseUrl}/transaction/initialize`,
        {
          email,
          amount, // Paystack expects amount in kobo
          currency: 'NGN',
          reference: `BIZ-${businessId}-${Date.now()}`,
          callback_url: `${this.configService.get('frontendUrl')}/payment/callback`,
          metadata: {
            business_id: businessId,
            payment_type: 'business_verification',
            ...metadata,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.paystackSecretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(`✅ Paystack payment initialized: ${response.data.data.reference}`);

      return {
        success: true,
        authorization_url: response.data.data.authorization_url,
        access_code: response.data.data.access_code,
        reference: response.data.data.reference,
      };
    } catch (error) {
      this.logger.error(`❌ Paystack initialization failed: ${error.message}`, error.stack);
      throw new Error(`Payment initialization failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Verify Paystack payment
   */
  async verifyPaystackPayment(reference: string) {
    this.logger.log(`Verifying Paystack payment: ${reference}`);

    try {
      const response = await axios.get(
        `${this.paystackBaseUrl}/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${this.paystackSecretKey}`,
          },
        },
      );

      const data = response.data.data;

      if (data.status !== 'success') {
        throw new Error(`Payment verification failed: ${data.gateway_response}`);
      }

      this.logger.log(`✅ Payment verified: ${reference} - ₦${data.amount / 100}`);

      return {
        success: true,
        amount: data.amount / 100, // Convert from kobo to naira
        currency: data.currency,
        paid_at: data.paid_at,
        channel: data.channel,
        metadata: data.metadata,
        customer: {
          email: data.customer.email,
          phone: data.customer.phone,
        },
      };
    } catch (error) {
      this.logger.error(`❌ Payment verification failed: ${error.message}`, error.stack);
      throw new Error(`Payment verification failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Initialize NOWPayments (Crypto) payment
   */
  async initializeNOWPayment(
    priceAmount: number, // in USD
    businessId: string,
    metadata: any = {},
  ) {
    this.logger.log(`Initializing NOWPayments for ${businessId}: $${priceAmount}`);

    // NOWPayments API integration
    // For testnet, we'll use sandbox credentials
    const nowpaymentsApiKey = this.configService.get('NOWPAYMENTS_API_KEY') || 'sandbox';
    const nowpaymentsUrl = 'https://api-sandbox.nowpayments.io/v1';

    try {
      const response = await axios.post(
        `${nowpaymentsUrl}/invoice`,
        {
          price_amount: priceAmount,
          price_currency: 'usd',
          pay_currency: 'usdthbar', // USDT on Hedera
          order_id: `BIZ-${businessId}-${Date.now()}`,
          order_description: `Business Verification Payment - ${businessId}`,
          ipn_callback_url: `${this.configService.get('API_BASE_URL')}/business/payment/nowpayments/callback`,
          success_url: `${this.configService.get('frontendUrl')}/business/payment/success`,
          cancel_url: `${this.configService.get('frontendUrl')}/business/payment/cancel`,
        },
        {
          headers: {
            'x-api-key': nowpaymentsApiKey,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(`✅ NOWPayments invoice created: ${response.data.id}`);

      return {
        success: true,
        invoice_id: response.data.id,
        invoice_url: response.data.invoice_url,
        order_id: response.data.order_id,
        price_amount: response.data.price_amount,
        price_currency: response.data.price_currency,
        pay_currency: response.data.pay_currency,
      };
    } catch (error) {
      this.logger.error(`❌ NOWPayments initialization failed: ${error.message}`, error.stack);
      
      // Fallback to manual USDT payment if NOWPayments is not configured
      return {
        success: true,
        method: 'manual_hedera',
        payment_address: this.configService.get('HEDERA_ACCOUNT_ID'),
        amount_usdt: priceAmount,
        instructions: 'Send USDT on Hedera network to the address above',
      };
    }
  }

  /**
   * Verify NOWPayments (Crypto) payment
   */
  async verifyNOWPayment(invoiceId: string) {
    this.logger.log(`Verifying NOWPayments invoice: ${invoiceId}`);

    const nowpaymentsApiKey = this.configService.get('NOWPAYMENTS_API_KEY') || 'sandbox';
    const nowpaymentsUrl = 'https://api-sandbox.nowpayments.io/v1';

    try {
      const response = await axios.get(
        `${nowpaymentsUrl}/invoice/${invoiceId}`,
        {
          headers: {
            'x-api-key': nowpaymentsApiKey,
          },
        },
      );

      const data = response.data;

      if (data.payment_status !== 'finished') {
        throw new Error(`Payment not completed: ${data.payment_status}`);
      }

      this.logger.log(`✅ Crypto payment verified: ${invoiceId}`);

      return {
        success: true,
        invoice_id: data.id,
        order_id: data.order_id,
        payment_status: data.payment_status,
        price_amount: data.price_amount,
        price_currency: data.price_currency,
        pay_amount: data.pay_amount,
        pay_currency: data.pay_currency,
        txn_id: data.pay_hash,
      };
    } catch (error) {
      this.logger.error(`❌ Crypto payment verification failed: ${error.message}`, error.stack);
      throw new Error(`Crypto payment verification failed: ${error.message}`);
    }
  }

  /**
   * Calculate tier pricing
   */
  getTierPricing(tier: number): { ngn: number; usd: number; discountedUsd: number } {
    const pricing = {
      1: { ngn: 0, usd: 0, discountedUsd: 0 }, // Basic (Free)
      2: { ngn: 25000, usd: 16, discountedUsd: 14 }, // Verified (15% discount for crypto)
      3: { ngn: 75000, usd: 48, discountedUsd: 41 }, // Premium (15% discount for crypto)
    };

    return pricing[tier] || pricing[1];
  }
}
