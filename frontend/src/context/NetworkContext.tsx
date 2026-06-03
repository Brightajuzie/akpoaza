import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

interface NetworkContextType {
  isConnected: boolean;
}

export const NetworkContext = createContext<NetworkContextType>({ isConnected: true });

export const useNetwork = () => useContext(NetworkContext);

export const NetworkProvider = ({ children }: { children: React.ReactNode }) => {
  const [isConnected, setIsConnected] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    // Read the initial network state so we know if we're offline on launch
    NetInfo.fetch().then((state: NetInfoState) => {
      if (mounted.current) {
        setIsConnected(state.isConnected ?? true);
      }
    });

    // Subscribe to real-time connectivity changes
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      if (mounted.current) {
        setIsConnected(state.isConnected ?? true);
      }
    });

    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, []);

  return (
    <NetworkContext.Provider value={{ isConnected }}>
      {children}
    </NetworkContext.Provider>
  );
};
