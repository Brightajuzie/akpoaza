import React from 'react';

// A simple mock for @stripe/stripe-react-native to prevent web crashes
export const StripeProvider = ({ children }) => <>{children}</>;
export const useStripe = () => ({});
export const useConfirmPayment = () => ({});
export const CardField = () => null;
export const usePaymentSheet = () => ({});
export const presentPaymentSheet = async () => ({});
export const initPaymentSheet = async () => ({});
export const initStripe = async () => ({});
