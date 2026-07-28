import React from 'react';
import Toast, { BaseToast, ErrorToast, BaseToastProps } from 'react-native-toast-message';

const toastConfig = {
  success: (props: BaseToastProps) => (
    <BaseToast
      {...props}
      style={{ borderLeftColor: '#4BB543' }}
      text1Style={{ fontSize: 15, fontWeight: '400' }}
      text2Style={{ fontSize: 13 }}
    />
  ),
  error: (props: BaseToastProps) => (
    <ErrorToast
      {...props}
      style={{ borderLeftColor: '#FF3333' }}
      text1Style={{ fontSize: 15, fontWeight: '400' }}
      text2Style={{ fontSize: 13 }}
    />
  ),
};

export const ToastProvider = () => {
  return <Toast config={toastConfig} />;
};

export default ToastProvider;
