import Razorpay from 'razorpay';
import { config } from '../config';

let instance: Razorpay | null = null;

export function getRazorpay(): Razorpay {
  if (!instance) {
    if (!config.razorpay.keyId || !config.razorpay.keySecret) {
      throw new Error('Razorpay keys are not configured');
    }
    instance = new Razorpay({
      key_id: config.razorpay.keyId,
      key_secret: config.razorpay.keySecret,
    });
  }
  return instance;
}
